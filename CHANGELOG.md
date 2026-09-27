## v21.25 — возвращено автоматическое вступление Фиделины

- Ключ первого знакомства обновлён до `nt_home_tour_v6`: браузер больше не принимает отметку старой сборки за прохождение нового вступления.
- После обновления Фиделина автоматически покажет вступление один раз.
- Постоянная кнопка «Повторить вступление» остаётся на главной странице.

## v21.24 — исправление запуска Windows

- `start.bat` переведён из Unix LF в обязательные для этого установщика Windows CRLF.
- Исправлен сбой CMD `The system cannot find the batch label specified - prepare_venv`: первый subroutine-вызов проходил, а повторный поиск следующей метки в LF-файле мог завершаться ошибкой.
- Добавлена регрессия, которая проверяет CRLF у каждого `.bat` и существование всех целей `call`/`goto`.

## v21.23 — визуальный редактор графа и изоляция контекста

- Scenario Studio получил настоящий визуальный граф: выбор ноды, инспектор, создание перехода перетаскиванием и перенос конца стрелки на другую ноду.
- Отдельную ноду можно изменить текстовым запросом; переходы и условия сохранены в раскрывающейся ручной панели.
- Повторная полная сборка защищена двухшаговым подтверждением, а генерация и refine показывают живой статус и сводку изменений.
- Refine больше не передаёт служебную оболочку как описание нового сценария; добавлены отдельный контракт редактирования, проверка утечки prompt и контекстный локальный fallback.
- Подсказки Фиделины и локальный разбор используют роль, цель и активную ноду пользовательского сценария. Знакомство с чатом хранится отдельно для каждого сценария.
- Рекомендации привязаны к исходному сценарию, а внутренние ID упражнений и RAG-карточек удаляются из пользовательского текста.
- Replay ключевой реплики автоматически переходит на экспертный резерв вместо ошибки 503.
- В технической информации показаны все диалоговые и smart-модели, назначение, активность, доступность, задержка и причина ошибки.
- В справочнике удалён второй декоративный checkbox, а плюсики раскрытия заменены едиными шевронами.

# v21.22

- Стабилизирован первый запуск знакомства и безопасная работа без доступного localStorage.
- Учебный режим переведён на progressive disclosure: текущий этап сначала, теория и полный курс по запросу.
- Удалён подтверждённый мёртвый frontend-код, добавлена карта модулей для следующих агентов.

## v21.21 — resilient Python bootstrap

- Added explicit Python 3.13 preference with Python 3.12 support.
- Detects a venv whose interpreter exists but whose pip module is missing.
- Repairs pip with `ensurepip`, then recreates the venv once if necessary.
- Uses the official `bootstrap.pypa.io/get-pip.py` as a final Windows fallback.
- Added equivalent validation and recreation to the macOS/Linux launcher.
- Added launcher regression coverage and updated setup documentation.
- Regression suite: 53 tests.

## v21.20 — reliable page tours

- Made tour startup return an explicit success state.
- Added bounded retries for API-rendered or temporarily hidden tour targets.
- Versioned page-tour progress keys so repaired introductions run once again.
- Bumped tour JS/CSS cache keys consistently across all supported pages.
- Added regression coverage for retry behavior and asset versions.
- Regression suite: 52 tests.

## v21.19 — package M1: session exit and SPIN learning redesign

- Added an explicit session exit dialog with finish-to-results, finish-to-home and resume-later choices.
- Supported abandoning a session before the first user turn.
- Versioned and expanded first-entry chat tours.
- Replaced the home bubble walkthrough with a dimmed, highlighted tour of every primary section.
- Added a first-visit and replayable Fidelina tour to Statistics.
- Reframed Learning as a single-method SPIN course with theory, introduction, practice, feedback and spaced repetition.
- Added visible S/P/I/N theory cards, a five-step roadmap and a learning-specific Fidelina.
- Fixed numeric-only average scores in Statistics.
- Regression suite: 51 tests.

## v21.18 — package H/J/K/L: production hardening before Yandex

- Isolated anonymous visitors with per-browser principals and HttpOnly sessions.
- Minimized learning attempts, reflections and saved custom-scenario context.
- Added account/server-data deletion and production-enforced secure cookies.
- Added universal graph semantic coverage, meaningful-branch checks and node rationale fields.
- Added a documented moderation policy and pre/post-generation safety checks.
- Restored replay from browser-local transcripts without persisting temporary context.
- Removed the dead automatic silence-ending path from voice sessions.
- Raised key learner-facing typography to 14px and unified Russian network errors.
- Split dialog/smart timeouts and compacted scenario JSON prompts after live provider testing.
- Regression suite: 49 tests.

## v21.17 — package G: Fidelina tab onboarding

- Added first-visit tours for Catalog, Handbook, Scenario Studio and Profile.
- Added page-specific progress keys, Skip and persistent Replay introduction controls.
- Added Fidelina branding, dimmed background and full-surface target highlighting.
- Added responsive top/bottom card placement on mobile and fixed tour-card stacking above highlighted regions.
- Added keyboard operation and reduced-motion behavior.

## v21.16 — package F: private local transcripts

- Moved completed transcripts and full personalized reports to browser-local storage with a 30-day/50-record retention policy.
- Minimized completed server sessions after analysis: messages, generated prose, quotes and cached model responses are deleted.
- Limited server result summaries to status, score, turn count, interest, violations and aggregate skill metrics.
- Added one-hour fallback cleanup for completed sensitive payloads and 24-hour expiry for abandoned active sessions.
- Added local JSON export, clear-history controls and explicit cross-device behavior in Profile.
- Kept aggregate recommendations working from sanitized result summaries; replay is unavailable after server transcript deletion.

## v21.15 — package E: contrast and typography

- Raised secondary-text contrast above 4.5:1 and meaningful border contrast to 3:1 on white.
- Added full-surface active navigation states and a non-overflowing mobile navigation layout.
- Enlarged role/opponent subtitles and made difficulty and response-engine selections visibly card-wide.
- Standardized the UI on one sans-serif family with 400/600/700 weights.
- Increased small user-facing text across the secretary, catalog, profile, handbook and scenario editor.

## v21.14 — package D: visual scenario graph editor

- Генерация теперь возвращает preview и не создаёт промежуточные записи в базе до нажатия «Сохранить».
- После генерации на той же странице открываются редактируемые карточки этапов и переходов.
- Можно менять названия, описания, реплики оппонента, подсказки, правила, ключевые слова, типы узлов и финалы.
- Добавлены создание и удаление узлов/переходов, синхронизация с расширенным JSON и структурная проверка.
- Поле «Что изменить в сценарии» применяет запрос к текущему графу; неупомянутые детали передаются модели с требованием сохранить.
- Перед заменой графа сохраняется локальная версия, доступна отмена; сетевой запрос также можно отменить.
- При наличии несохранённых правок браузер предупреждает перед закрытием страницы.

## v21.13 — package C: required fields and input limits

- Обязательными для генерации сделаны описание ситуации, цель, роль пользователя и роль собеседника.
- Обязательные поля отмечены звёздочкой; перед кнопкой выводится общий список пропусков, поля подсвечиваются, а страница прокручивается к первому из них.
- Во всех текстовых полях интерфейса заданы ограничения длины.
- Scenario Studio показывает постоянные счётчики символов в правом нижнем углу полей.
- Реплика чата ограничена 2000 символами и снабжена счётчиком.
- Ограничения продублированы в API-схемах, включая сценарии, сообщения, роли, ограничения, списки и JSON-настройки.

## v21.12 — package B: handbook interactions and sources

- Удалены стрелки возврата из заголовков страниц и панели тренировки; основная навигация выполняется браузером и верхним меню.
- Чек-листы методик стали интерактивными, сохраняют отметки локально и поддерживают сброс.
- Источники скрыты в раскрывающемся блоке «Источники и издания».
- Библиография всех семи методик расширена: добавлены авторы, полные названия, издательства/организации, редакции и годы без внешних ссылок.

## v21.11 — package A: clear coach controls and product information

- Действия Фиделины переименованы в «Закрыть подсказку» и «Убрать Фиделину».
- Технические индикаторы моделей скрыты из обычного интерфейса и перенесены в раскрываемый раздел окна «О приложении».
- Рядом с названием приложения добавлена кнопка информации о продукте, команде и канале обратной связи.
- На обычных страницах добавлен нижний блок контактов команды «Случайно залетевшие».
- Статусы последних результатов локализованы: «успешно», «неуспешно», «прервано», «в процессе».
- Из сообщений и итогового разбора убраны названия моделей, задержки и признаки fallback.

## v21.10 — stable back navigation and replayable introduction

- Крестик выхода из текстовой и голосовой сессии заменён на неподвижную стрелку назад.
- Все стрелки возврата используют историю браузера и не запускают анимацию ухода со страницы.
- Активная попытка при возврате не закрывается и может быть продолжена позже.
- На главной добавлена видимая кнопка «Повторить вступление».
- После скрытия Фиделины появляется компактная кнопка с её иконкой для восстановления персонажа.

## v21.9 — grounded custom scenarios and model routing

- Пользовательский сценарий возврата товара больше не подменяется общим sales-графом: добавлены контекстная проверка и специализированный офлайн-граф.
- Пустые поля ролей и цели передаются как запрос на вывод из описания, а не сохраняются как служебные значения.
- В брифе показывается фактическая роль оппонента; навыки и советы берутся из `coach_focus` и `coach_hint`, а не из технических intent-переходов.
- Онлайн-ход чата с JSON-классификацией направляется в быструю `DIALOG_MODEL`; генерация сценария и итоговый анализ остаются в `SMART_MODEL`.
- Рост интереса откалиброван: крик и повтор требования без ответа на вопрос не дают положительного прироста.
- Итоговый анализ не принимает игнорирование вопросов или давление за сильную сторону.

## v21.8 — direct custom-scenario entry
- На главный экран добавлена карточка «Создать свой сценарий».
- Карточка ведёт прямо в Scenario Studio и кратко объясняет генерацию ролей, этапов и развилок.
- Добавлены отдельная иконка, мягкое визуальное выделение и frontend-регрессия маршрута.
- Обновлён cache-busting `home.css`; проверены desktop и mobile.

## v21.7 — fixed Fidelina viewport anchoring
- Удалён translateY из анимаций `body`: он превращал viewport-fixed виджет в элемент, привязанный к длинной странице.
- Виджет закреплён у нижнего правого края с safe-area отступами на desktop и mobile.
- Обновлены cache-busting версии `base.css` и `secretary.css`.
- Добавлен frontend-регрессионный тест и визуальная проверка после прокрутки на 1440×900 и 390×844.

## v21.6 — live QA и контекстный генератор
- На облачных моделях проверены чат, Фиделина в двух встроенных и пользовательском сценарии, сохранение истории и отсутствие RAG-утечек.
- Увеличен JSON-бюджет генератора сценариев до 6000 токенов; добавлен один облачный retry с полным исходным описанием.
- Семантически общий граф отклоняется для производственного пилота, даже если JSON и связи формально валидны.
- Экспертный fallback получил отдельный тип `pilot` с этапами рисков, безопасности, простоя, границ и точки остановки.
- Пузырь Фиделины получил собственную вертикальную прокрутку.
- Финальный пользовательский цикл прошёл 9/9; итоговый набор — 34 backend-теста.

## v21.5 — скрытый RAG в советах Фиделины
- Советник использует фактически переданный RAG-контекст, но не упоминает карточки, чанки, ID или источники.
- Сервер удаляет случайно скопированную техническую разметку до ответа пользователю.
- API не возвращает RAG-метаданные; для людей остаётся справочник семи методик.
- Добавлены engine- и API-регрессии на отсутствие утечки RAG-разметки; итоговый набор — 32 теста.

## v21.4 — камера, знакомство и граф по запросу
- Фиделина на главной закреплена за viewport и больше не уезжает при прокрутке.
- Онбординг расширен до шести шагов с пропуском и повторным запуском.
- Граф сценария возвращён как лениво создаваемый сворачиваемый блок после основной кнопки запуска.
- Уточнена формула оценки времени: 1,2 минуты на пользовательскую реплику; нулевая сессия показывает 0.
- Модальное окно советника дополнительно защищено от обрезания на мобильных экранах.
- Локальная генерация получила контекстные ветки возражений для конфликта, карьеры, продаж и закупок.
- Добавлены три backend-регрессии; итоговый набор — 30 тестов.
- Проверены обработчики 75 кнопок.

## v21.3 — сценарии, таймеры и Фиделина
- Убран интерактивный граф со страницы запуска сценария, чтобы не скрывать бриф, настройки и основное действие.
- Лёгкий режим подключён к серверной манере оппонента и локальному экспертному fallback.
- Пустой диалог больше не получает совет: до первой реплики `/hint` возвращает понятный `409`, а интерфейс объясняет следующий шаг.
- Фиделина проверена во втором сценарии; при отсутствии профиля сценария используется безопасный профиль по умолчанию.
- Исправлено обрезание длинного совета в модальном окне.
- Таймер ответа стал необязательным напоминанием; голосовая сессия не завершается из-за десяти секунд тишины.
- Добавлено первое знакомство с Фиделиной на главной и позиционирование относительно страницы.
- Scenario Studio получил тематический offline-generator, предпросмотр этапов, защиту от случайного сохранения общего шаблона, публикацию в каталог и прямой переход к запуску.
- Поповеры состояния моделей открываются кликом; аудит обработчиков прошли 67 кнопок, ссылок без `href` нет.

## v21.2 — LLM-RAG и продолжение учебного контура
- Добавлен единый `start.bat`: он находит или через `winget` устанавливает Python 3.12+, создаёт `.venv`, устанавливает все библиотеки из `requirements.txt`, сохраняет существующий `.env` и запускает приложение.
- `start-demo.bat` оставлен совместимым ярлыком и вызывает единый запускатель; добавлен режим `start.bat --no-browser`.
- Добавлен optional grounded LLM-coach для конкретного ответа на упражнение.
- Рекомендательная система после сессии переведена на candidate-constrained LLM-RAG с валидируемыми exercise IDs.
- RAG-ответы возвращают источники чанков, confidence, runtime и режим fallback.
- Добавлен `PROJECT_CONTEXT.md` для безопасного продолжения работы.
- Добавлены мягкие переходы между страницами и reduced-motion fallback.
- Учебная страница переведена на верхнюю горизонтальную траекторию этапов, более информативные карточки и заметные enter/result-анимации.
- Задания получили поля «контекст → действие → цель → чего не делать».
- Добавлен provisional synthetic gold set из 25 кейсов для регрессионной проверки без команды разметчиков.

## v21.1 — полноценный SPIN-учебный контур
- Расширена траектория с 6 до 19 упражнений без подключения остальных шести методик.
- Добавлены юниты «Ориентация», S, P, I, N и «Перенос в разговор».
- Добавлены очереди повторения, следующий шаг, интервалы 3/7 дней после успешных попыток и немедленный возврат ошибки на повторение.
- Добавлена короткая рефлексия после мини-диалога.
- Переписаны задания в формате «контекст → действие → признак успеха», убрана лишняя методическая терминология.
- Навигация по этапам закреплена сверху; убраны фокус и прокрутка, которые уводили пользователя вниз страницы.
- Экспертная оценка стала устойчивой к естественным перефразировкам и показывает рабочую версию вместо бинарного «неправильно».
- Добавлены версии контента и рубрики (`content_version`, `rubric_version`).
- Добавлено скрытое состояние оппонента для salary-сценария; публичные ответы API его не отдают.
- Исправлена гонка фонового model probe при явной проверке статуса.
- Проверки: 27 backend-тестов, learning validator и RAG benchmark проходят.

## v21 — первый учебный контур
- На главной странице появилась кнопка «Учебный режим».
- Добавлена первая учебная траектория SPIN: шесть заданий, уровни основы и переноса, короткая обратная связь по критериям.
- Добавлено сохранение `learning_attempts` и `skill_mastery` в пользовательскую БД.
- Добавлены маршруты `/api/learning/catalog`, `/api/learning/progress`, `/api/learning/attempt`.
- Добавлен отдельный renderer `learning.html` без смешения справочника и учебных упражнений.
- Добавлен мини-диалог SPIN на три хода.
- В итогах сессии появились переходы к персональному упражнению и переигрыванию ключевой реплики.
- Добавлен `evidence-first` слой анализа: точная цитата, наблюдаемое действие, навык, confidence и улучшенная реплика.
- Непроверяемые модельные цитаты отбрасываются; для очевидной ранней презентации есть безопасный offline fallback.
- Replay теперь восстанавливает состояние сценария перед исходным ходом и прогоняет альтернативную реплику через реальный движок оппонента, не изменяя исходную сессию.
- Старый пакет 147 карточек оставлен как архив и источник для будущей миграции, но не импортируется в пользовательский RAG.
- RAG начал индексировать summary, steps, phrases, antipatterns и checks; добавлен SPIN benchmark с Recall@3/Recall@5.

## v20 — справочник из 7 методик (handbook v3)
- `handbook.html` больше не показывает атомарные карточки: каталог строится из `frontend/content/catalog.json` (7 методик).
- Поиск ищет по полному тексту методик (шаги, примеры, ошибки); фильтр «Все типы» заменён фильтром по ситуациям.
- `method.html?id=<id>` — единый renderer (`js/method.js`) для `frontend/content/methods/*.json`.
- Исправлена вёрстка: логотип и шапка как на остальных страницах, иконка поиска внутри поля, кнопка «назад» по краю контента.
- Старые ссылки `handbook.html?entry=<chunk-id>` перенаправляют на страницу методики.
- В брифе, графе, итогах и просмотре сессии вместо ID чанков показываются названия методик (`NTData.methodLinks`).
- RAG не изменён: `backend/app/knowledge/handbook.json` и `/api/knowledge/*` продолжают работать для оппонента, коуча и анализа.

## v19 — 24.09.2026

См. раздел «Исправления v19» в README: устойчивость ходов, модельный резерв, сохранение транскриптов, SPIN и адаптивная вёрстка.

## v19.1 — расширенный справочник и ссылки RAG
- Импортированы 164 карточки по Harvard, SPIN, BATNA, якорению, активному слушанию, жёстким тактикам, закрытию, плейбукам и глоссарию.
- Подключены 22 упражнения в `backend/app/knowledge/drills.json` и endpoint `/api/knowledge/drills`.
- RAG сохраняет `source_ref`, `related_ids`, методику, этап и уровень карточки.
- В промпты передаются более содержательные фрагменты: summary, шаги и источник.
- Итоговый анализ принимает проверяемые `knowledge_refs` и показывает ссылки на карточки.
- Ранжирование дополнено нормализацией русских словоформ для типовых запросов.

## v17 — единая система движения и чистка палитры

## v18 — цепочки моделей и чистая шапка чата

### Модели
- Добавлен реестр моделей `backend/app/llm/registry.py`: приоритетные цепочки для диалога и анализа.
- Проверка доступности выполняется один раз при старте сервера (фоновый поток, параллельно, таймаут 12 с).
- В диалоге проверок нет: берётся первая живая модель из цепочки; упавшая модель помечается и пропускается до перезапуска.
- Новые переменные `.env`: `DIALOG_MODEL_FALLBACKS`, `SMART_MODEL_FALLBACKS` (по 3 запасных кандидата на роль).
- `/api/models/status` отдаёт блок `candidates` со статусом, задержкой и причиной отказа каждой модели; `/api/health` показывает активную модель.

### Интерфейс
- Строка с моделью убрана из заголовка чата и переехала в кнопку вверху справа (текстовый и голосовой режимы).
- При наведении на кнопку — список всех кандидатов с цветовыми индикаторами и задержкой.
- На главном экране подсказка индикатора модели теперь перечисляет все проверенные модели, а не только активную.
- Фиделина больше не перекрывает ответ: при открытой правой панели она уходит влево, а если места нет (узкий экран или обе панели) — скрывается.

### Движение по стандарту Material Design 3
- В `css/base.css` добавлены токены: кривые `--ease-standard` / `--ease-decelerate` / `--ease-accelerate`
  и шкала длительностей `--dur-1`…`--dur-5` (100/150/200/300/400 мс).
- Все 34 перехода в 11 CSS-файлах переведены с ручных значений (.12s, .15s, .16s, 160ms, .18s, .2s, .3s, .4s, .5s)
  на токены. Жёстких длительностей в `transition` больше не осталось.
- Появление блоков (`[data-reveal]`) и выпадающее меню используют кривую замедления вместо линейной `ease`.

### Слои состояний
- Добавлены `--state-hover` (7%) и `--state-press` (12%) — одна и та же подложка для `.btn`, `.icon-btn`,
  `.profile__btn`, `.menu__item` вместо трёх разных ручных заливок.
- Нажатие кнопки — `scale(.985)` за 100 мс вместо сдвига на 1px (не дёргает соседние элементы).
- Появился стиль для выключенных кнопок (`[disabled]`, `[aria-disabled="true"]`).
- Фокус-кольцо вынесено в `--focus-ring`.

### Палитра: убраны остатки старой синей темы
- 25 мест с `rgba(52,152,219,…)` (синие рамки при наведении и синие фокус-кольца на зелёном интерфейсе),
  `rgba(44,62,80,…)`, `#F1F4F7`, `#EEF2F6`, `#9AA8B6` заменены на зелёную базу и токены
  `--neutral-soft` / `--neutral-mute`.

### Доступность и мобильные
- `prefers-reduced-motion` теперь гасит и бесконечные анимации (пульс таймера, кольца звонка),
  а не только их длительность — требование WCAG 2.1 § 2.3.3.
- На экранах до 560px зона нажатия кнопок увеличена до 44px.

### Проверка
- Скриншоты в headless Chromium на ширинах 390px и 1440px для `index`, `scenario`, `session`, `catalog`.
- Баланс скобок во всех 12 CSS-файлах сошёлся, `node --check` по всем `js/*.js` — без ошибок.
- Версия ассетов поднята до `?v=17`.

## v16 — Фиделина вместо дубля секретаря и мобильная карта сценария
- Удалён второй портрет персонажа из панели советов (текстовый и голосовой режим): в панели остаётся только подпись и кнопка, сам персонаж живёт в правом нижнем углу.
- Коуч переименован в Фиделину во всех местах: кнопка «Спросить Фиделину», заголовки панелей, пузырь, alt/aria-подписи, состояния контроллера, шаги обучения.
- Советы по-прежнему приходят в панель советов и не попадают в диалог: пузырь персонажа не раскрывается автоматически.
- Удалён мёртвый стиль `.secretary-inline` (52×76 px), из-за которого фигура в полный рост выглядела смятой.
- Версии заново обучающих туров подняты до v16, чтобы старый localStorage не подавлял онбординг.
- Ко всем статическим файлам страниц сессий и карточки сценария добавлен `?v=16`, иначе тестировщик видел кэш прежнего JS.
- Карта сценария на узких экранах: основной вид — список этапов, карта веток открывается переключателем.
- Добавлен pinch-zoom двумя пальцами и корректное освобождение указателей; перетаскивание больше не залипает.
- На мобильном карта открывается в читаемом масштабе от стартового узла вместо сжатия всего полотна 1650 px.
- Инспектор этапа на узких экранах работает как нижняя панель с кнопкой закрытия; тап по этапу в списке открывает описание и условия переходов.
- Увеличены подписи узлов и высота элементов списка под палец.

## v15 — общие финалы, серверные сводки и экспорт
- Обобщены исходы диалогов и выбор финального узла.
- Добавлены серверные сводки без транскрипта, печать/PDF и JSON-экспорт.
- Расширена проверка кризисных тем.

# Изменения в обновлённой версии

- Быстрая модель переключена на `google/gemini-3.1-flash-lite`; умная модель оставлена `deepseek/deepseek-v4-pro`.
- Добавлены таймауты, повтор временных запросов, безопасные ошибки и fallback при пустом/шаблонном ответе.
- Добавлена полноценная офлайн-экспертная система без API-ключа.
- Добавлены сценарии закупок и межкомандного конфликта; голосовой режим убран из заявленных возможностей MVP.
- Добавлен явный тип финала `success/failure/neutral`.
- Добавлен отдельный чат с переговорным советником.
- Добавлен конструктор сценариев: генерация, предпросмотр и публикация.
- Переработано оформление карты сценария и адаптивность интерфейса.
- Исправлены состояния анализа, шкала заинтересованности и подписи статусов сессий.
- Ограничены размеры пользовательского ввода и CORS.
- Добавлены `.env.example`, фиксированные версии зависимостей и запуск для macOS/Linux.
- Из итогового архива исключены ключи, БД, виртуальное окружение и кэши.

## Исправления после тестирования

- Устранено дублирование сообщений советника: они отображаются только в отдельном чате справа и не передаются оппоненту.
- Классификация реплики и ответ оппонента объединены в один быстрый запрос к модели.
- Негативная корректировка ограничена диапазоном `-12..15`; переговоры больше не завершаются из-за одной ошибочной оценки модели.
- Положительные достижения в зарплатном сценарии переводят разговор к обсуждению условий.
- Облачный API автоматически переключается на экспертную систему при ошибке, таймауте или лимите.
- Итоговый разбор при отказе умной модели формируется локальным экспертом, а не заглушкой `50/100`.
- Граф перестроен сверху вниз; удалены пересекающиеся номера рёбер, переходы сгруппированы по исходному этапу.
- Завершённые и прерванные чаты удаляются автоматически; в истории остаются только активные.
- `start-demo.bat` полностью автоматизирует создание окружения, установку зависимостей и запуск.

## Graph engine v3

- Старый гибридный граф из HTML-карточек, SVG-линий и номеров переходов полностью заменён единым SVG-движком.
- Узлы и линии теперь используют одну систему координат и физически не могут смещаться относительно друг друга.
- Убраны номера рёбер и общий перегруженный список условий.
- При выборе узла подсвечиваются только его исходящие маршруты, а ниже показываются карточки возможных переходов.
- Циклические обратные связи отображаются пунктиром; финалы автоматически помещаются на последний уровень.
- Советник больше не сохраняется в transcript или БД сессии: его сообщения существуют только в отдельной правой панели.
- Добавлено отключение кэша и version query, чтобы браузер не продолжал использовать старый JavaScript.

## Salary scenario v4

- Все прежние сценарии удалены; оставлен один подробный сценарий повышения зарплаты.
- Сценарий содержит 15 этапов, 40 переходов, бюджетные, временные и результативные возражения, пакетные варианты и два позитивных финала.
- Все сессии очищаются при запуске приложения.
- Создание сессии больше не вызывает модель: стартовый ответ готов мгновенно.
- Числовые показатели удалены с карточек узлов.
- Нижние подробности и список переходов удалены: граф занимает всю рабочую область.
- Описание узла и условия переходов показываются в плавающем инспекторе слева или справа при наведении.

## Graph engine v5

- Добавлен фиксированный пространственный layout зарплатного сценария: узлы больше не могут собраться в верхней строке.
- Граф отображается в отдельном viewport на всю доступную область.
- Добавлены масштабирование колесом, кнопки `+`/`−`, команда «Показать всё», перемещение мышью и фокус на отдельном узле.
- Справа добавлен компактный порядок этапов; нажатие фокусирует соответствующую область графа.
- При наведении показываются описание этапа и условия его переходов, а несвязанные линии приглушаются.
- `start-demo.bat` больше не переиспользует старый процесс на порту 8000: прежний сервер останавливается перед запуском текущей сборки.
- Добавлен идентификатор сборки `salary-v5` и cache-busting `v=5.0`.


## Merge: новый дизайн + функциональное ядро v6

- Сохранён новый многостраничный дизайн: главная, каталог, сценарий, текстовая и голосовая сессии, результаты, история и просмотр попытки.
- Backend обновлён до v6: подробный зарплатный сценарий, контекстные prompts, cloud/offline failover и устойчивое завершение диалога.
- Голосовая страница подключена к настоящему режиму `voice`, Web Speech API и браузерному TTS.
- Звёзды сложности связаны с `easy/medium/hard`; в hard скрыта заинтересованность и сервер запрещает советника.
- Завершённые результаты сохраняются локально в браузере без хранения transcript в серверной БД.
- Итоговая страница дополнена профилем пяти переговорных навыков.
- Удалено тестовое непрофессиональное название, бренд унифицирован как Negotiation Lab.
- BAT останавливает старый сервер, запускает текущую папку и открывает сборку `salary-v6-merged`.

## v7 — interface difficulty, scenario map, early completion
- Replaced the ambiguous star control with explicit Easy / Medium / Hard interface modes.
- Easy shows exact interest and approximate remaining turns; Medium shows qualitative interest and remaining turns; Hard removes progress, indicators, stage data and coach/reference hints.
- Added an interactive scenario graph with selectable nodes, visible transitions, branch descriptions and outcomes before session start.
- Added semantic `resolution` handling so a genuine model agreement can finish successfully before the visual progress bar fills.
- Replaced the one-line chat field with a multiline textarea (Enter sends, Shift+Enter adds a line).
- Restored visible selection/copying of message text.
- Added first-run spotlight tours for text and voice sessions, plus a replay `?` button.
- Added a home-screen model/token status popover. The token count is intentionally a configurable placeholder (`TOKEN_BUDGET_REMAINING`) until a provider billing endpoint is connected.

## v8 — personalized reports, clear routes, honest credits
- Fixed a corrupted offline-analysis prompt matcher and switched final analysis to the proven dialog model instead of an often unavailable secondary model.
- Added strict report validation, transcript fingerprints and transcript-dependent fallback scoring. Different attempts now produce different feedback and skill profiles.
- Pinned the results page to the session that just finished; failed abandon/timeout requests can no longer reopen the previous report.
- Added visible processing states while the opponent and final report are being generated.
- Added browser speech dictation to the text chat; recognized text remains editable before sending.
- Replaced the wide crossing-arrow scenario graph with a readable vertical main route, separate objection branches and explicit outcomes.
- Removed the fake token-budget number. The header shows real API credits only if UniKey returns balance metadata; otherwise it honestly links to the provider dashboard.
- Interest history is now saved per opponent turn, so the historical session chart uses real values instead of a two-point placeholder.
- Wired the existing session-length slider to the backend turn limit and progress display.

## v9 — restored interactive graph and real RAG foundation
- Restored the earlier node-link graph workspace: SVG nodes and edges, hover inspector, transition details, zoom, pan, fit-to-screen, focus-on-click and stage outline.
- Added automatic layered layout for future generated/user scenarios while preserving the curated salary-scenario layout.
- Restored the active model label and added visible RAG index status alongside honest API-credit availability.
- Added a real BM25 retrieval layer over a structured negotiation handbook with scenario, source, kind and tag metadata.
- Grounded opponent turns, coach hints, final scoring and future scenario generation in retrieved handbook fragments.
- Added `/api/knowledge/status` and `/api/knowledge/search` for the future handbook UI and ingestion pipeline.
- Added prompt-injection boundaries: retrieved content is reference data, never executable instructions.
- Versioned the first-entry chat tour again so previous localStorage cannot suppress onboarding in this build.

## v10 — graph interaction and behavior termination
- Graph inspector is now hidden unless a node or outline item is hovered/focused.
- Ordinary mouse-wheel input scrolls the page; graph zoom requires Ctrl/Command + wheel or toolbar buttons.
- Added persisted per-message violation flags. One off-topic request gets a warning; repeated off-topic behavior or abusive language ends the session immediately with failure.
- The opponent explicitly refuses code, games and unrelated tasks instead of following the detour.
- Final-analysis validation rewrites broken placeholders such as “Отсутствуют” into complete grammatical Russian sentences.
- Removed RAG status from the active-model popover; RAG remains visible in its relevant session information area and API status.

## v11 — Scenario Studio
- Added a user-facing scenario editor with editable metadata, personas, modes, nodes, outcomes and transitions.
- Added smart-model scenario generation grounded through the existing RAG retrieval boundary.
- Added NDJSON generation progress: RAG/model stages arrive immediately, then graph bubbles rise into the canvas one by one.
- Added a structural graph doctor for broken references, dead ends, weak branching, duplicate triggers, unreachable nodes and missing outcomes.
- Added persistent local drafts, publish and test flows; demo startup no longer deletes user-created scenarios by default.
- The detailed salary-negotiation scenario can be loaded as an editable reference copy.
- Prepared stable seams for a future vector index and shared multi-user database without faking auth or sharing in this local build.

## v12 — observable AI and expert runtime
- Added explicit Auto / cloud-only / expert-system launch modes for text and voice sessions.
- Every opponent and secretary answer now reports its actual responder, model, fallback state and latency.
- Added a real model health probe plus local recent cloud-success statistics.
- Strengthened the deterministic expert system and expanded reports from five to eight negotiation skills.
- Scenario Studio is full-width; only context is required, while roles, goal, tone, constraints and generator are optional.
- Added an explicit trainee role, safer crisis-topic rejection and graph branch-to-ending simulation checks.
- Added an asset-ready animated secretary slot; coach traffic remains private and blocked in hard mode.
- Removed the provider website link from the active-model popover.

## v13 — session polish and editor pause
- Temporarily removed the entire user-scenario editor UI and its home entry pending a team UX redesign.
- Disabled the bouncing placeholder animation for the future secretary sprite system.
- Removed responder telemetry from secretary advice and removed the scripted-opening badge.
- Made misconduct visible to final analysis and replaced misleading praise headings with neutral observations when appropriate.
- Added inappropriate physical/personal propositions to business-roleplay conduct detection.
- Added Russian labels for all eight skills in both result and session-history views.

## v14 — secretary controller and UX cleanup
- Integrated five optimized transparent WebP character states (about 148 KB total instead of 1.3 MB).
- Added one shared secretary state controller for home, text and voice sessions.
- Added idle, talking, thinking, success and warning transitions without positional jumping.
- Added persistent hide/show controls, preloading, reduced-motion support and mobile sizing.
- Cached real model availability checks for five minutes per browser session.
- Removed fake credit UI and unavailable profile/settings/help links.
- Added voice compatibility checks before launch and safe direct-page behavior.
- Added an explicit localized reason for every completed attempt.
- Replaced visible fallback terminology with clear Russian wording.

## v19 — справочник, методическая разметка и второй сценарий

- Добавлен handbook UI и API для списка/карточки знаний.
- В карточки добавлены поля для будущей векторной индексации: шаги, фразы, антипаттерны, проверки, уровень и этап.
- Основной зарплатный сценарий получил ссылки на Harvard/BATNA и скрытые поля коуча на ключевых этапах.
- Добавлен сценарий «Конфликт в команде: сроки, ответственность и доверие» с 12 узлами и 28 переходами.
- Добавлен минимальный пользовательский Scenario Studio с сохранением черновика в SQLite.
- Убраны принудительные повторные сетевые probe моделей из главной и страницы сценария.
