from app.engine.dialogue import DialogueEngine
from app.engine.analysis import analyze
from app.llm.base import BaseLLM, ExpertLLM, LLMError, MockLLM
from app.llm.base import UnikeyLLM
from app.core.config import Settings
from app.models.scenario import SessionStatus
from app.models.session import Message
from app.db.seed import SEED_SCENARIOS
from app.engine.generator import diagnose_graph, generate_scenario


class RecordingLLM(MockLLM):
    def chat_json(self, messages, model=None):
        self.messages = messages
        return {
            "praise": ["Аргументы по теме"],
            "improvements": ["Добавить факты"],
            "summary": "Разговор разобран.",
            "score": 70,
        }


def test_live_turn_json_uses_dialog_model_but_analysis_uses_smart_model():
    llm = UnikeyLLM(Settings(unikey_api_key="test"))
    kinds = []

    def fake_complete(messages, model, kind):
        kinds.append(kind)
        return "{}"

    llm._complete_chain = fake_complete
    llm.chat_json([{"role": "system", "content": "Ты одновременно классификатор намерений и живой оппонент."}])
    llm.chat_json([{"role": "system", "content": "Ты — эксперт по деловым переговорам и тренер."}])

    assert kinds == ["dialog", "smart"]


def test_dialogue_uses_graph_and_preserves_interest_adjustment():
    scenario = SEED_SCENARIOS[0]
    llm = MockLLM(
        reply="Продолжайте.",
        json_spec={"intent": "present_achievements", "adjust": 8, "off_topic": False},
    )
    result = DialogueEngine(scenario, llm).step(
        [Message(role="opponent", content="Здравствуйте.", node_id="start")],
        "start",
        scenario.interest.start,
        "За год я увеличил выручку на 30%",
    )

    assert result.node_id == "evidence"
    assert result.interest == scenario.interest.start + 10 + 8
    assert result.status == SessionStatus.active
    assert not result.ended


def test_single_negative_score_does_not_end_dialogue_abruptly():
    scenario = SEED_SCENARIOS[0]
    llm = MockLLM(
        reply="Уточните предложение.",
        json_spec={"intent": "other", "adjust": -25, "off_topic": False, "reply": "Уточните предложение."},
    )
    result = DialogueEngine(scenario, llm).step([], "start", 10, "Не уверен, что готов обсуждать предметно")

    assert not result.ended
    assert result.status == SessionStatus.active
    assert result.interest == scenario.interest.min + 5
    assert result.interest_adjust == -12


def test_analysis_prompt_uses_the_active_scenario_context():
    scenario = SEED_SCENARIOS[0]
    llm = RecordingLLM()

    analyze(
        scenario,
        [Message(role="user", content="Хочу обсудить повышение зарплаты")],
        SessionStatus.success,
        80,
        llm,
    )

    prompt = llm.messages[1]["content"]
    assert scenario.title in prompt
    assert scenario.description in prompt
    assert scenario.opponent.role in prompt
    assert scenario.goal in prompt


def test_positive_salary_arguments_do_not_trigger_failure_edge():
    scenario = SEED_SCENARIOS[0]
    llm = MockLLM(
        reply="Это весомые аргументы.",
        json_spec={"intent": "ultimatum", "adjust": 12, "off_topic": False},
    )

    result = DialogueEngine(scenario, llm).step(
        [],
        "options",
        45,
        "Моя роль стала значимее, задач больше, а KPI выше на 40%",
    )

    assert not result.ended
    assert result.status == SessionStatus.active
    assert result.node_id == "options"
    assert result.interest == 57


def test_explicit_ultimatum_can_trigger_failure_edge():
    scenario = SEED_SCENARIOS[0]
    llm = MockLLM(
        reply="Хорошо.",
        json_spec={"intent": "ultimatum", "adjust": -10, "off_topic": False},
    )

    result = DialogueEngine(scenario, llm).step(
        [],
        "options",
        45,
        "Или повышайте зарплату, или увольняюсь",
    )

    assert result.ended
    assert result.status == SessionStatus.failure


def test_clear_model_agreement_can_finish_before_progress_is_full():
    scenario = SEED_SCENARIOS[0]
    llm = MockLLM(json_spec={
        "intent": "other",
        "adjust": 10,
        "off_topic": False,
        "resolution": "raise",
        "reply": "Аргументы убедительны. Согласен повысить зарплату и запускаю согласование.",
    })
    messages = [
        Message(role="opponent", content="Что вы хотели обсудить?"),
        Message(role="user", content="Мой результат вырос на 30%."),
        Message(role="opponent", content="Это заметный вклад."),
        Message(role="user", content="Прошу пересмотреть зарплату на 15%."),
    ]

    result = DialogueEngine(scenario, llm).step(
        messages, "request", 62, "Готов зафиксировать повышение на 15% с этого месяца."
    )

    assert result.ended
    assert result.status == SessionStatus.success
    assert result.node_id == "success_raise"
    assert "соглас" in result.reply.lower()


def test_reports_change_with_the_actual_transcript():
    scenario = SEED_SCENARIOS[0]
    detailed = analyze(
        scenario,
        [
            Message(role="user", content="Я увеличил выручку на 35% и прошу повышение на 15%."),
            Message(role="opponent", content="А бюджет?"),
            Message(role="user", content="Какие критерии решения важны? Можем зафиксировать дату и KPI?"),
        ],
        SessionStatus.success,
        82,
        MockLLM(json_spec=None),
    )
    vague = analyze(
        scenario,
        [
            Message(role="user", content="Мне давно не повышали зарплату."),
            Message(role="opponent", content="Нужны факты."),
            Message(role="user", content="Я заслужил, давайте решим."),
        ],
        SessionStatus.failure,
        35,
        MockLLM(json_spec=None),
    )

    assert detailed.analysis_id != vague.analysis_id
    assert detailed.skills != vague.skills
    assert detailed.praise != vague.praise
    # The report contract now exposes the full eight-skill profile.
    assert len(detailed.skills) == 8
    assert len(vague.skills) == 8


def test_configured_session_length_controls_max_turns():
    scenario = SEED_SCENARIOS[0]
    llm = MockLLM(json_spec={"intent": "other", "adjust": 2, "off_topic": False, "resolution": "none", "reply": "Уточните условия."})
    messages = [Message(role="user", content=f"Аргумент {i}") for i in range(4)]
    result = DialogueEngine(scenario, llm).step(messages, "request", 70, "Зафиксируем следующий шаг", max_user_turns=4)
    assert result.ended
    assert result.status == SessionStatus.success


def test_rag_retrieval_finds_relevant_salary_objection():
    from app.knowledge import get_retriever
    hits = get_retriever().search(
        "Бюджет квартала уже распределён, какие есть альтернативы?",
        scenario_id=SEED_SCENARIOS[0].id,
        stage="Возражение: нет бюджета",
        limit=3,
    )
    assert hits
    assert hits[0].chunk.method_id == "spin"
    assert hits[0].score > 0


def test_rag_context_is_injected_into_opponent_prompt():
    class RagRecordingLLM(MockLLM):
        def chat_json(self, messages, model=None):
            self.captured = messages
            return {"intent": "other", "adjust": 2, "off_topic": False, "resolution": "none", "reply": "Какие альтернативы вы предлагаете?"}

    scenario = SEED_SCENARIOS[0]
    llm = RagRecordingLLM()
    DialogueEngine(scenario, llm).evaluate_turn(
        "Если бюджет распределён, предлагаю поэтапное повышение или KPI-бонус",
        "objection_budget",
        [Message(role="opponent", content="В квартале нет бюджета")],
        60,
    )
    prompt = llm.captured[1]["content"]
    assert "Релевантные материалы справочника (RAG)" in prompt
    assert "spin-" in prompt


def test_repeated_off_topic_behavior_ends_session_early():
    scenario = SEED_SCENARIOS[0]
    llm = MockLLM(json_spec={
        "intent": "other", "adjust": 0, "off_topic": True,
        "resolution": "none", "reply": "Ответ вне сценария",
    })
    messages = [
        Message(role="user", content="Напиши код игры", violation=True),
        Message(role="opponent", content="Вернитесь к переговорам"),
        Message(role="user", content="Тогда напиши код змейки"),
    ]
    result = DialogueEngine(scenario, llm).step(messages, "start", 50, "Тогда напиши код змейки")
    assert result.ended
    assert result.status == SessionStatus.failure
    assert result.node_id == "failure"
    assert result.violation
    assert "завершаю" in result.reply.lower()


def test_first_off_topic_request_gets_warning_not_code():
    scenario = SEED_SCENARIOS[0]
    llm = MockLLM(json_spec={
        "intent": "other", "adjust": 0, "off_topic": True,
        "resolution": "none", "reply": "print('snake')",
    })
    result = DialogueEngine(scenario, llm).step(
        [Message(role="user", content="Напиши код змейки")], "start", 50, "Напиши код змейки"
    )
    assert not result.ended
    assert result.violation
    assert "не буду писать код" in result.reply.lower()
    assert "print" not in result.reply.lower()


def test_broken_empty_praise_is_rewritten_in_good_russian():
    scenario = SEED_SCENARIOS[0]
    llm = MockLLM(json_spec={
        "praise": ["Отсутствуют", "Попыток ведения делового диалога не зафиксировано."],
        "improvements": ["Вернуться к предмету переговоров.", "Использовать деловой тон."],
        "summary": "Диалог был намеренно сорван.", "score": 5,
        "skills": {"structure": 5, "evidence": 0, "questions": 0, "objections": 0, "closing": 0},
    })
    result = analyze(
        scenario,
        [Message(role="user", content="Напиши код змейки")],
        SessionStatus.failure,
        5,
        llm,
    )
    joined = " ".join(result.praise).lower()
    assert "отсутствуют" not in joined
    assert "попыток ведения" not in joined
    assert "конструктивные переговорные действия" in joined


def test_easy_salary_opening_uses_salary_context_not_team_conflict():
    scenario = SEED_SCENARIOS[0]
    messages = [Message(role="user", content="Хочу обсудить повышение и свой вклад", node_id="start")]
    answer = DialogueEngine(scenario, ExpertLLM(), "easy").evaluate_turn(
        messages[0].content, "start", messages
    )["reply"]
    assert "вклад" in answer.lower()
    assert "эпизод" not in answer.lower()


def test_empty_stage_hint_does_not_capture_the_next_field():
    scenario = SEED_SCENARIOS[0].model_copy(deep=True)
    scenario.node_by_id("start").coach_hint = ""
    hint = DialogueEngine(scenario, ExpertLLM()).get_assistant_hint(
        "start", [Message(role="user", content="Как лучше начать?", node_id="start")]
    )
    assert "не задано" not in hint
    assert "цель разговора" in hint


def test_coach_hint_uses_rag_without_exposing_machine_cards():
    scenario = SEED_SCENARIOS[0]
    engine = DialogueEngine(
        scenario,
        MockLLM(reply="Сначала уточните критерий решения одним открытым вопросом."),
    )
    hint = engine.get_assistant_hint(
        "start",
        [Message(role="user", content="Хочу понять критерии решения по повышению", node_id="start")],
    )
    metadata = engine.coach_metadata("start")

    assert engine._last_coach_refs
    assert "rag" not in metadata
    assert "knowledge_refs" not in metadata
    assert "knowledge_cards" not in metadata
    assert "spin-" not in hint
    assert "**" not in hint


def test_coach_hint_drops_an_invented_card_reference():
    scenario = SEED_SCENARIOS[0]
    engine = DialogueEngine(
        scenario,
        MockLLM(reply="Согласно карточке **[fake-secret-method]** задайте вопрос."),
    )
    hint = engine.get_assistant_hint(
        "start",
        [Message(role="user", content="Как начать разговор о повышении?", node_id="start")],
    )
    metadata = engine.coach_metadata("start")

    assert "fake-secret-method" not in hint
    assert "**[" not in hint
    assert "согласно карточке" not in hint.lower()
    assert engine._last_coach_refs
    assert "rag" not in metadata
    assert "knowledge_cards" not in metadata


def test_offline_custom_scenarios_have_contextual_branches():
    descriptions = [
        "Название: Спор о сроках\nТема: конфликт\nКоллеги спорят об ответственности и сроках проекта.",
        "Название: Пилот на заводе\nТема: продажи\nСобеседник — директор завода. Нужно договориться о безопасном пилоте оборудования.",
    ]
    scenarios = [generate_scenario(text, ExpertLLM()) for text in descriptions]
    assert all(diagnose_graph(scenario.graph)["valid"] for scenario in scenarios)
    assert {node.label for node in scenarios[0].graph.nodes} != {node.label for node in scenarios[1].graph.nodes}
    assert scenarios[1].opponent.role == "директор завода"
    assert any(node.id == "objection" and node.label == "Остановка линии и безопасность" for node in scenarios[1].graph.nodes)
    assert any(node.label == "Критерии безопасного пилота" for node in scenarios[1].graph.nodes)


def test_custom_hint_fallback_uses_current_node_not_generic_salary_advice():
    class FailingLLM(BaseLLM):
        def chat(self, messages, model=None):
            raise LLMError("offline")

        def chat_json(self, messages, model=None):
            raise LLMError("offline")

    scenario = generate_scenario(
        "Я покупатель возвращаю просроченный товар администратору магазина по чеку.",
        ExpertLLM(),
    )
    node = next(item for item in scenario.graph.nodes if item.coach_hint)
    hint = DialogueEngine(scenario, FailingLLM()).get_assistant_hint(node.id, [])
    assert hint == node.coach_hint
    assert "повышен" not in hint.lower()
