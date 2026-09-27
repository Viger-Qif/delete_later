"""Единственный демонстрационный сценарий: подробные переговоры о повышении зарплаты."""
from app.models.scenario import Scenario
from app.db.seed_team_conflict import TEAM_CONFLICT_SCENARIO

SEED_VERSION = "salary_v3"

SEED_SCENARIOS: list[Scenario] = [
    Scenario(
        id="sc_salary_complete_v3",
        title="Повышение зарплаты: переговоры с руководителем",
        description=(
            "Вы — сильный специалист, чья зона ответственности и результаты заметно выросли за последний год. "
            "Нужно договориться о повышении зарплаты, не превращая разговор в ультиматум. Руководитель "
            "проверяет качество аргументов, сопоставляет вклад с рынком, ссылается на бюджет и может предложить "
            "отложенное или условное решение."
        ),
        difficulty="medium",
        industry="career",
        modes=["text", "voice"],
        user_role="Сотрудник, который обсуждает пересмотр своей компенсации",
        goal="Получить повышение на 15–20% сейчас либо письменный план пересмотра с датой, KPI и ответственным",
        constraints=[
            "не угрожать увольнением",
            "не сравнивать себя с коллегами в негативном ключе",
            "не выдумывать предложения от других компаний",
            "опираться на результаты, расширение роли и данные рынка",
            "зафиксировать конкретный следующий шаг",
        ],
        opponent={
            "role": "Руководитель отдела, который отвечает за результат команды и фонд оплаты труда",
            "style": "прагматичный, уважительный, задаёт неудобные вопросы, проверяет цифры и не даёт обещаний без условий",
            "tone": "деловой и прямой",
        },
        assistant={
            "role": "Карьерный переговорный коуч",
            "style": "помогает отделять факты от эмоций, формулировать взаимную выгоду и фиксировать договорённости",
            "tone": "спокойный и конкретный",
        },
        interest={"start": 52, "min": 0, "max": 100},
        max_adjust=15,
        scenario_type="curated",
        tags=["карьера", "зарплата", "компенсация", "Harvard", "BATNA"],
        knowledge_refs=[],
        coach_profile={
            "focus": ["интересы вместо позиций", "измеримые критерии", "BATNA и варианты"],
            "default_hint": "Помоги отделить позицию от интереса и перевести разговор в критерии, варианты и следующий шаг.",
        },
        opponent_state={
            "interests": [
                "удержать сильного специалиста",
                "сохранить управляемость фонда оплаты труда",
                "защитить решение перед финансовым директором",
            ],
            "authority": "Может согласовать план и обосновать пересмотр, но не единолично меняет бюджет текущего квартала.",
            "constraints": [
                "бюджет текущего квартала уже распределён",
                "нужны сопоставимые результаты и понятные критерии",
                "обещание без даты и владельца не считается решением",
            ],
            "hidden_facts": [
                "У сотрудника действительно выросла зона ответственности.",
                "Руководитель готов обсуждать план пересмотра, если появятся KPI и дата.",
                "Немедленное повышение на 20% без обоснования будет отклонено.",
            ],
            "acceptance_conditions": [
                "повышение с доказанным вкладом и понятной суммой",
                "или письменный план с KPI, датой пересмотра и ответственным",
            ],
            "walkaway_conditions": [
                "ультиматум",
                "выдуманный оффер",
                "атака на коллег или руководителя",
            ],
            "concession_budget": "Может предложить поэтапное изменение, бонус или дату пересмотра, но каждая уступка требует встречного обязательства.",
        },
        published=True,
        graph={
            "nodes": [
                {
                    "id": "start", "type": "start", "label": "Открытие разговора",
                    "description": "Руководитель готов выслушать тему встречи, но ожидает краткую и профессиональную рамку разговора.",
                    "interest_delta": 0,
                    "prompt_hint": "Привет. У нас есть около двадцати минут. Что ты хотел обсудить?",
                },
                {
                    "id": "agenda", "type": "phase", "label": "Рамка и цель встречи",
                    "description": "Нужно обозначить, что разговор касается пересмотра компенсации на основе изменившегося вклада, а не личной потребности в деньгах.",
                    "interest_delta": 4,
                    "knowledge_refs": [],
                    "coach_hint": "Помоги сформулировать деловую повестку: интерес сотрудника — признание выросшей ценности, интерес руководителя — управляемое решение.",
                    "coach_focus": ["интересы сторон", "повестка"],
                    "watch_for": ["деловая цель", "взаимная выгода"],
                    "avoid": ["личные расходы как главный аргумент", "ультиматум"],
                },
                {
                    "id": "evidence", "type": "phase", "label": "Доказательства результата",
                    "description": "Руководитель просит 2–3 измеримых результата: выручка, экономия, скорость, качество, удержание клиентов или завершённые проекты.",
                    "interest_delta": 10,
                    "knowledge_refs": [],
                    "coach_hint": "Попроси превратить общее заявление о пользе в связку: исходная точка → действие → измеримый эффект → период.",
                    "coach_focus": ["факты", "метрики", "личный вклад"],
                    "watch_for": ["цифры", "период", "личное действие"],
                    "avoid": ["голые проценты без контекста"],
                },
                {
                    "id": "scope", "type": "phase", "label": "Расширение ответственности",
                    "description": "Важно показать, какие задачи фактически стали сложнее: лидерство, наставничество, решения, риски и влияние на команду.",
                    "interest_delta": 8,
                },
                {
                    "id": "market", "type": "phase", "label": "Рыночный ориентир",
                    "description": "Обсуждаются релевантные вилки рынка. Данные должны дополнять доказательства вклада, а не заменять их.",
                    "interest_delta": 5,
                    "knowledge_refs": [],
                    "coach_hint": "Рынок — внешний критерий, а не аргумент сам по себе. Свяжи вилку с сопоставимой ролью и выросшей ответственностью.",
                    "coach_focus": ["объективные критерии", "сопоставимость"],
                    "watch_for": ["уровень", "регион", "объём роли"],
                    "avoid": ["сравнение с коллегами", "непроверенные офферы"],
                },
                {
                    "id": "request", "type": "phase", "label": "Конкретный запрос",
                    "description": "Нужно назвать обоснованный диапазон повышения и связать его с новой ценностью роли.",
                    "interest_delta": 7,
                },
                {
                    "id": "objection_budget", "type": "phase", "label": "Возражение: нет бюджета",
                    "description": "Руководитель признаёт аргументы, но сообщает, что бюджет текущего квартала уже распределён.",
                    "interest_delta": -5,
                },
                {
                    "id": "objection_performance", "type": "phase", "label": "Возражение: вклад недостаточно ясен",
                    "description": "Руководитель просит отделить командный результат от личного вклада и показать устойчивость достижений.",
                    "interest_delta": -6,
                },
                {
                    "id": "objection_timing", "type": "phase", "label": "Возражение: не время",
                    "description": "Руководитель предлагает вернуться к вопросу позже, но пока не называет дату и критерии.",
                    "interest_delta": -4,
                },
                {
                    "id": "options", "type": "phase", "label": "Варианты решения",
                    "description": "Стороны рассматривают повышение сейчас, поэтапный рост, разовую премию, KPI-бонус или пересмотр в определённую дату.",
                    "interest_delta": 7,
                    "knowledge_refs": [],
                    "coach_hint": "Предложи 2–3 пакета, а не одну уступку. У каждого варианта должны быть условия и понятная ценность для обеих сторон.",
                    "coach_focus": ["варианты", "BATNA", "обмен"],
                    "watch_for": ["несколько пакетов", "встречное обязательство"],
                    "avoid": ["уступка без условия", "ложная срочность"],
                },
                {
                    "id": "tradeoffs", "type": "phase", "label": "Условия и встречные обязательства",
                    "description": "Руководитель готов двигаться навстречу при понятных обязательствах: новая зона ответственности, KPI или срок оценки.",
                    "interest_delta": 6,
                },
                {
                    "id": "commitment", "type": "phase", "label": "Фиксация договорённости",
                    "description": "Нужно проговорить сумму или диапазон, дату вступления в силу, KPI, следующую встречу и того, кто запускает согласование.",
                    "interest_delta": 10,
                    "knowledge_refs": [],
                    "coach_hint": "Проверь, что договорённость операционализирована: сумма, дата, KPI, следующий контакт и ответственный.",
                    "coach_focus": ["закрытие", "фиксация"],
                    "watch_for": ["дата", "критерии", "ответственный"],
                    "avoid": ["положительный тон без конкретики"],
                },
                {
                    "id": "success_raise", "type": "end", "label": "Повышение согласовано",
                    "description": "Руководитель подтверждает повышение и запускает формальное согласование.",
                    "interest_delta": 0, "outcome": "success",
                },
                {
                    "id": "success_plan", "type": "end", "label": "Согласован план пересмотра",
                    "description": "Зафиксированы дата, измеримые KPI и обязательство вернуться к решению. Это конструктивный промежуточный успех.",
                    "interest_delta": 0, "outcome": "success",
                },
                {
                    "id": "failure", "type": "end", "label": "Разговор сорван",
                    "description": "Ультиматум или давление разрушили возможность конструктивного решения.",
                    "interest_delta": 0, "outcome": "failure",
                },
            ],
            "edges": [
                {"from": "start", "to": "agenda", "trigger": {"type": "intent", "value": "set_agenda"}},
                {"from": "start", "to": "evidence", "trigger": {"type": "intent", "value": "present_achievements"}},
                {"from": "start", "to": "objection_performance", "trigger": {"type": "intent", "value": "demand_raise"}},

                {"from": "agenda", "to": "evidence", "trigger": {"type": "intent", "value": "present_achievements"}},
                {"from": "agenda", "to": "scope", "trigger": {"type": "intent", "value": "explain_scope"}},
                {"from": "agenda", "to": "market", "trigger": {"type": "intent", "value": "mention_market"}},

                {"from": "evidence", "to": "scope", "trigger": {"type": "intent", "value": "explain_scope"}},
                {"from": "evidence", "to": "market", "trigger": {"type": "intent", "value": "mention_market"}},
                {"from": "evidence", "to": "request", "trigger": {"type": "intent", "value": "make_specific_request"}},
                {"from": "evidence", "to": "objection_performance", "trigger": {"type": "intent", "value": "use_vague_claims"}},

                {"from": "scope", "to": "market", "trigger": {"type": "intent", "value": "mention_market"}},
                {"from": "scope", "to": "request", "trigger": {"type": "intent", "value": "make_specific_request"}},
                {"from": "scope", "to": "objection_performance", "trigger": {"type": "intent", "value": "compare_with_colleagues"}},

                {"from": "market", "to": "request", "trigger": {"type": "intent", "value": "make_specific_request"}},
                {"from": "market", "to": "objection_budget", "trigger": {"type": "intent", "value": "ask_decision"}},
                {"from": "market", "to": "objection_performance", "trigger": {"type": "intent", "value": "rely_only_on_market"}},

                {"from": "request", "to": "objection_budget", "trigger": {"type": "intent", "value": "discuss_budget"}},
                {"from": "request", "to": "objection_timing", "trigger": {"type": "intent", "value": "ask_timeline"}},
                {"from": "request", "to": "options", "trigger": {"type": "intent", "value": "propose_options"}},

                {"from": "objection_budget", "to": "evidence", "trigger": {"type": "intent", "value": "reinforce_value"}},
                {"from": "objection_budget", "to": "options", "trigger": {"type": "intent", "value": "propose_compromise"}},
                {"from": "objection_budget", "to": "objection_timing", "trigger": {"type": "intent", "value": "ask_timeline"}},
                {"from": "objection_budget", "to": "failure", "trigger": {"type": "intent", "value": "threaten_quit"}},

                {"from": "objection_performance", "to": "evidence", "trigger": {"type": "intent", "value": "provide_metrics"}},
                {"from": "objection_performance", "to": "scope", "trigger": {"type": "intent", "value": "explain_scope"}},
                {"from": "objection_performance", "to": "options", "trigger": {"type": "intent", "value": "propose_kpi_plan"}},
                {"from": "objection_performance", "to": "failure", "trigger": {"type": "intent", "value": "ultimatum"}},

                {"from": "objection_timing", "to": "options", "trigger": {"type": "intent", "value": "ask_for_concrete_date"}},
                {"from": "objection_timing", "to": "tradeoffs", "trigger": {"type": "intent", "value": "propose_kpi_plan"}},
                {"from": "objection_timing", "to": "failure", "trigger": {"type": "intent", "value": "threaten_quit"}},

                {"from": "options", "to": "tradeoffs", "trigger": {"type": "intent", "value": "propose_package"}},
                {"from": "options", "to": "commitment", "trigger": {"type": "intent", "value": "ask_decision"}},
                {"from": "options", "to": "objection_budget", "trigger": {"type": "intent", "value": "reject_alternatives"}},
                {"from": "options", "to": "failure", "trigger": {"type": "intent", "value": "ultimatum"}},

                {"from": "tradeoffs", "to": "commitment", "trigger": {"type": "intent", "value": "agree_terms"}},
                {"from": "tradeoffs", "to": "options", "trigger": {"type": "intent", "value": "negotiate_terms"}},
                {"from": "tradeoffs", "to": "objection_budget", "trigger": {"type": "intent", "value": "reject_conditions"}},

                {"from": "commitment", "to": "success_raise", "trigger": {"type": "intent", "value": "confirm_raise"}},
                {"from": "commitment", "to": "success_plan", "trigger": {"type": "intent", "value": "confirm_review_plan"}},
                {"from": "commitment", "to": "tradeoffs", "trigger": {"type": "intent", "value": "clarify_terms"}},
                {"from": "commitment", "to": "failure", "trigger": {"type": "intent", "value": "ultimatum"}},
            ],
        },
    )
]

SEED_SCENARIOS.append(TEAM_CONFLICT_SCENARIO)
