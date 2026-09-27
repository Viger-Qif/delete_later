from app.db.seed import SEED_SCENARIOS
import pytest
from app.engine.generator import ScenarioSafetyError, diagnose_graph, generate_scenario, refine_scenario, semantic_quality
from app.llm.base import BaseLLM, ExpertLLM, LLMError
from app.models.scenario import Graph


def test_salary_graph_passes_structural_doctor():
    report = diagnose_graph(SEED_SCENARIOS[0].graph)
    assert report["valid"] is True
    assert report["errors"] == []
    assert report["warnings"] == []
    assert report["stats"] == {"nodes": 15, "edges": 41, "reachable": 15, "endings": 3, "launchable": True}


def test_graph_doctor_finds_dead_end_and_unreachable_nodes():
    graph = Graph.model_validate({
        "nodes": [
            {"id": "start", "type": "start", "label": "Старт"},
            {"id": "dead", "type": "phase", "label": "Тупик"},
            {"id": "success", "type": "end", "label": "Успех", "outcome": "success"},
            {"id": "failure", "type": "end", "label": "Провал", "outcome": "failure"},
        ],
        "edges": [{"from": "start", "to": "dead", "trigger": {"type": "intent", "value": "continue"}}],
    })
    report = diagnose_graph(graph)
    assert report["valid"] is False
    assert any("тупиком" in message for message in report["errors"])
    assert any("Недостижимые узлы" in message for message in report["errors"])
    assert any("успешного финала" in message for message in report["errors"])
    assert any("неуспешного финала" in message for message in report["warnings"])


def test_generated_scenario_supports_text_and_voice():
    scenario = generate_scenario(
        "Переговоры о повышении зарплаты с возражениями по бюджету и срокам",
        ExpertLLM(),
    )
    assert scenario.modes == ["text", "voice"]
    assert diagnose_graph(scenario.graph)["valid"] is True


def test_cloud_generator_retries_once_before_expert_repair():
    class FlakyCloud(BaseLLM):
        def __init__(self):
            self.calls = 0
            self.expert = ExpertLLM()

        def chat(self, messages, model=None):
            return self.expert.chat(messages, model)

        def chat_json(self, messages, model=None):
            self.calls += 1
            if self.calls == 1:
                raise LLMError("Модель вернула некорректный JSON.")
            return self.expert.chat_json(messages, model)

    provider = FlakyCloud()
    scenario = generate_scenario(
        "Переговоры директора завода о сроках и рисках пилотного проекта",
        provider,
        allow_expert_repair=False,
    )

    assert provider.calls == 2
    assert diagnose_graph(scenario.graph)["valid"] is True


def test_generic_cloud_graph_is_rejected_for_industrial_pilot():
    class GenericCloud(BaseLLM):
        def __init__(self):
            self.calls = 0
            self.expert = ExpertLLM()

        def chat(self, messages, model=None):
            return self.expert.chat(messages, model)

        def chat_json(self, messages, model=None):
            self.calls += 1
            generic = [
                {"role": "system", "content": messages[0]["content"]},
                {"role": "user", "content": "Описание сценария:\nТема: конфликт\nКоллеги спорят о распределении ответственности."},
            ]
            return self.expert.chat_json(generic, model)

    provider = GenericCloud()
    scenario = generate_scenario(
        "Директор завода согласует безопасный пилот на одной производственной линии.",
        provider,
        allow_expert_repair=True,
    )

    assert provider.calls == 2
    assert any("пилот" in node.label.lower() or "безопас" in node.label.lower() for node in scenario.graph.nodes)


def test_high_risk_context_is_rejected_safely():
    with pytest.raises(ScenarioSafetyError):
        generate_scenario("Уговорить мужчину не прыгнуть с крыши", ExpertLLM())


def test_universal_semantic_gate_rejects_unrelated_domain_graph():
    generic = generate_scenario(
        "Коллеги спорят о распределении ответственности в команде.",
        ExpertLLM(),
    )
    report = semantic_quality(
        "Фармацевт согласует с аптечной сетью холодовую цепь для вакцин и температурные датчики.",
        generic,
    )
    assert report["valid"] is False


def test_illegal_scenario_is_rejected_without_echoing_input():
    with pytest.raises(ScenarioSafetyError) as error:
        generate_scenario("Научи менеджера как ограбить клиента", ExpertLLM())
    assert "illegal_harm" in str(error.value)


def test_refine_keeps_domain_and_never_leaks_edit_envelope():
    original = generate_scenario(
        "Название: Исекай у ворот гильдии\nТема: фэнтези\n"
        "Я герой. Собеседник — лидер гильдии. Цель пользователя: вступить в группу.",
        ExpertLLM(),
    )
    refined = refine_scenario(original, "я хочу больше этапов и больше исходов", ExpertLLM())
    visible = " ".join(
        [refined.title, refined.description, refined.goal]
        + [f"{node.label} {node.description}" for node in refined.graph.nodes]
    ).lower()
    assert refined.title == original.title
    assert len(refined.graph.nodes) > len(original.graph.nodes)
    assert any(node.outcome and node.outcome.value == "neutral" for node in refined.graph.nodes)
    assert diagnose_graph(refined.graph)["valid"] is True
    assert "измени существующий сценарий строго" not in visible
    assert "текущий сценарий json" not in visible
    assert "возврат товара" not in visible


def test_visible_prompt_leak_from_cloud_is_rejected_then_repaired():
    class LeakyCloud(BaseLLM):
        def chat(self, messages, model=None):
            return ""

        def chat_json(self, messages, model=None):
            data = ExpertLLM().chat_json([
                messages[0],
                {"role": "user", "content": "Описание сценария:\nТема: возврат товара\nЯ покупатель, хочу вернуть товар."},
            ])
            data["graph"]["nodes"][1]["description"] = (
                "Измени существующий сценарий строго по запросу пользователя. "
                "Текущий сценарий JSON:"
            )
            return data

    original = generate_scenario(
        "Директор завода обсуждает безопасный пилот на линии.",
        ExpertLLM(),
    )
    refined = refine_scenario(original, "добавь этап проверки безопасности", LeakyCloud())
    assert diagnose_graph(refined.graph)["valid"] is True
    assert all("текущий сценарий json" not in node.description.lower() for node in refined.graph.nodes)


def test_local_refine_can_change_one_node_without_rebuilding_graph():
    original = generate_scenario(
        "Покупатель обсуждает возврат просроченного товара с администратором магазина.",
        ExpertLLM(),
    )
    target = next(node for node in original.graph.nodes if node.coach_hint)
    refined = refine_scenario(
        original,
        f"Измени только этап «{target.label}» (id={target.id}): сделай подсказку конкретнее — попроси показать чек.",
        ExpertLLM(),
    )
    changed = refined.node_by_id(target.id)
    assert changed.coach_hint.endswith("попроси показать чек")
    assert len(refined.graph.nodes) == len(original.graph.nodes)
