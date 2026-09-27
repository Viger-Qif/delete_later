"""Cloud LLM provider and a deterministic offline negotiation expert."""
from __future__ import annotations
import json, re, time
from abc import ABC, abstractmethod
from typing import Any
import httpx
from app.core.config import Settings

class LLMError(Exception): pass
class LLMQuotaError(LLMError): pass

class BaseLLM(ABC):
    @abstractmethod
    def chat(self, messages: list[dict[str,str]], model: str|None=None) -> str: ...
    @abstractmethod
    def chat_json(self, messages: list[dict[str,str]], model: str|None=None) -> Any: ...

class UnikeyLLM(BaseLLM):
    def __init__(self, settings: Settings):
        self.settings=settings
        self.credit_balance = None
        self.usage_total_tokens = 0
        self._client=httpx.Client(base_url=settings.unikey_base_url,headers={"Authorization":f"Bearer {settings.unikey_api_key}"},timeout=httpx.Timeout(settings.llm_timeout_seconds,connect=10))
    def _complete(self,messages,model,kind='dialog',timeout=None):
        for attempt in range(self.settings.llm_max_retries+1):
            try:
                is_scenario = kind == "smart" and any(
                    "проектировщик сценариев" in str(message.get("content", "")).lower()
                    for message in messages
                )
                # A launchable graph with node-level coaching fields regularly
                # exceeds 3k tokens. Truncation produces an otherwise valid but
                # unclosed JSON object, so reserve a larger budget only here.
                max_tokens = 6000 if is_scenario else (3000 if kind == "smart" else 1000)
                resp=self._client.post('/chat/completions',json={"model":model,"messages":messages,"temperature":.3 if is_scenario else .55,"max_tokens":max_tokens}, timeout=httpx.Timeout(timeout or self.settings.llm_timeout_seconds, connect=min(10, timeout or self.settings.llm_timeout_seconds)))
            except (httpx.TimeoutException,httpx.NetworkError) as exc:
                if attempt<self.settings.llm_max_retries: time.sleep(.4); continue
                raise LLMError("Провайдер модели временно недоступен. Попробуйте ещё раз.") from exc
            if resp.status_code==200:
                try:
                    payload = resp.json()
                    usage = payload.get("usage") or {}
                    self.usage_total_tokens += int(usage.get("total_tokens") or 0)
                    # UniKey does not currently document a balance endpoint. If the gateway starts
                    # returning balance metadata, recognise it without exposing the API key.
                    candidates = [
                        payload.get("credits_remaining"), payload.get("credit_balance"), payload.get("balance"),
                        resp.headers.get("x-credits-remaining"), resp.headers.get("x-credit-balance"),
                        resp.headers.get("x-ai-credits-remaining"),
                    ]
                    for candidate in candidates:
                        if candidate is not None:
                            try: self.credit_balance = float(candidate)
                            except (TypeError, ValueError): pass
                            if self.credit_balance is not None: break
                    msg=payload["choices"][0]["message"]; content=msg.get("content")
                    if isinstance(content,list): content=''.join(p.get('text','') if isinstance(p,dict) else str(p) for p in content)
                    if not isinstance(content,str) or not content.strip(): raise LLMError("Модель не вернула видимый текст ответа.")
                    return content.strip()
                except (ValueError,KeyError,IndexError,TypeError) as exc: raise LLMError("Провайдер вернул ответ в неизвестном формате.") from exc
            body=resp.text[:500].lower()
            if resp.status_code in (402,429) or any(x in body for x in ('quota','credit','balance','rate limit')): raise LLMQuotaError("Закончился лимит модели или сработало ограничение запросов.")
            if resp.status_code>=500 and attempt<self.settings.llm_max_retries: time.sleep(.4); continue
            raise LLMError(f"Ошибка провайдера модели: HTTP {resp.status_code}")
        raise LLMError("Провайдер модели не ответил.")
    def _chain(self,kind,model):
        if model: return [model]
        try:
            from app.llm import registry
            chain=registry.chain_for(kind)
        except Exception:
            chain=[]
        return chain or [self.settings.smart_model if kind=='smart' else self.settings.dialog_model]
    def _complete_chain(self,messages,model,kind):
        # Никаких проверок доступности на каждом шаге: просто идём по приоритетному списку.
        last=None
        per_request = (
            self.settings.llm_smart_timeout_seconds
            if kind == "smart"
            else self.settings.llm_dialog_timeout_seconds
        )
        deadline=time.monotonic()+self.settings.llm_total_deadline_seconds
        for candidate in self._chain(kind,model):
            remaining=deadline-time.monotonic()
            if remaining<=1: break
            started=time.perf_counter()
            try:
                out=self._complete(messages,candidate,kind,min(per_request,remaining))
            except LLMError as exc:
                last=exc
                try:
                    from app.llm import registry
                    registry.mark_failed(candidate,str(exc))
                except Exception: pass
                continue
            self.last_model=candidate
            try:
                from app.llm import registry
                registry.mark_ok(candidate,round((time.perf_counter()-started)*1000))
            except Exception: pass
            return out
        raise last or LLMError('Нет доступных облачных моделей.')
    @staticmethod
    def _json_kind(messages) -> str:
        """Route real-time turn classification to the fast chain.

        Scenario generation, post-session analysis and learning reports remain
        on the smart chain. Previously every JSON response used SMART_MODEL,
        so the live chat always selected DeepSeek despite DIALOG_MODEL.
        """
        system = " ".join(
            str(message.get("content", "")).lower()
            for message in messages
            if message.get("role") == "system"
        )
        if "классификатор намерений" in system or "одновременно классификатор" in system:
            return "dialog"
        return "smart"

    def chat(self,messages,model=None):
        self.last_kind = "dialog"
        return self._complete_chain(messages,model,"dialog")

    def chat_json(self,messages,model=None):
        self.last_kind = self._json_kind(messages)
        return _extract_json(self._complete_chain(messages,model,self.last_kind))

class ExpertLLM(BaseLLM):
    """Playable fallback without network or a paid key."""
    settings=None
    positive=('цифр','результат','эффект','выгода','потребност','уточн','предлага','пилот','компромисс','срок','kpi','метрик')
    negative=('ультимат','увольня','скидка 50','обязан','немедленно','глуп','угрож','массаж','поцел','свидание','сексуаль')
    def chat(self,messages,model=None):
        system=messages[0].get('content','').lower() if messages else ''; prompt=messages[-1].get('content','') if messages else ''; text=_tail(prompt); low=text.lower()
        if 'переговорный коуч' in system:
            if any(x in low for x in self.negative): return 'Снизьте давление: признайте позицию руководителя и предложите два реалистичных варианта.'
            grounded=re.search(r'Заготовка коуча этапа:[ \t]*([^\r\n]*)',prompt,re.I)
            if grounded and grounded.group(1).strip():
                return grounded.group(1).strip()
            return 'Назовите цель разговора и задайте один открытый вопрос о том, что важно другой стороне.'
        if 'одновременно классификатор' in system:
            return self._opponent_reply(prompt)
        if 'начало переговоров' in low: return 'Привет. У нас около двадцати минут. Что именно ты хотел обсудить?'
        return self._opponent_reply(prompt)
    def _opponent_reply(self,prompt):
        stage_match=re.search(r'Текущий этап:\s*([^\n.]+)',prompt); stage=(stage_match.group(1).lower() if stage_match else '')
        message_match=re.search(r'Новая реплика пользователя:\s*(.+)$',prompt,re.S); message=(message_match.group(1).strip(" \'\"") if message_match else _tail(prompt)); low=message.lower()
        if any(x in low for x in self.negative): return 'Ультиматум не поможет принять решение. Если хочешь продолжить, давай вернёмся к фактам и вариантам без давления.'
        if 'режим сложности: easy' in prompt.lower():
            context_low=prompt.lower()
            if 'открытие' in stage or 'рамка' in stage:
                if any(x in context_low for x in ('повышен', 'зарплат')):
                    return 'Хорошо, давай обсудим твой вклад. Какой один результат лучше всего подтверждает запрос?'
                if any(x in context_low for x in ('коллег', 'команд', 'конфликт')):
                    return 'Хорошо, давай разберёмся спокойно. Назови один конкретный эпизод и то, что ты хотел бы изменить.'
                if any(x in context_low for x in ('клиент', 'заказчик', 'покупател')):
                    return 'Хорошо, я готов обсудить задачу. С какого одного результата или ограничения клиента начнём?'
                return 'Хорошо, давай разберём это постепенно. Назови один результат или одну причину, с которой удобнее начать.'
            if any(x in low for x in ('бюджет','стоимость','дорого','цена')):
                return 'Понимаю логику предложения. Какой один вариант поможет сохранить результат при ограниченном бюджете?'
            if '?' in message:
                return 'Хороший вопрос. Для меня важнее всего понятный результат и реалистичный следующий шаг — предложи один вариант.'
            return 'Я понял основную мысль. Уточни один конкретный результат или следующий шаг, и продолжим.'
        if 'открытие' in stage or 'рамка' in stage:
            if '%' in message or any(x in low for x in ('kpi','выруч','проект','эконом')):
                return 'Результат заметный. Какую часть этого эффекта обеспечили именно твои решения и насколько расширилась твоя ответственность?'
            return 'Понял тему. Назови два-три результата за последний период, которые лучше всего показывают, как изменился твой вклад.'
        if 'доказательства' in stage:
            if '%' in message or any(x in low for x in ('kpi','выруч','эконом','срок')): return 'Цифры сильные. Какая часть этого результата зависела именно от твоих решений, и повторяется ли эффект несколько кварталов?'
            return 'Мне нужен более конкретный пример: исходная точка, твоё действие и измеримый результат для бизнеса.'
        if 'ответственност' in stage:
            return 'Какие решения ты теперь принимаешь самостоятельно и какую ответственность несёшь сверх первоначальной роли?'
        if 'рыночн' in stage:
            return 'На какие вакансии, уровень компаний и регион ты опираешься? Мне важно сравнить действительно сопоставимые роли.'
        if 'конкретный запрос' in stage:
            return 'Какой диапазон повышения ты считаешь обоснованным и почему именно он соответствует новому масштабу роли?'
        if 'бюджет' in stage:
            return 'Аргументы я услышал, но фонд этого квартала распределён. Какие варианты кроме полного повышения сейчас ты готов обсуждать?'
        if 'вклад недостаточно' in stage:
            return 'Пока я вижу результат команды в целом. Покажи, какие решения и действия были лично твоими.'
        if 'не время' in stage:
            return 'Сейчас решение провести сложно. Какую дату и какие критерии ты предлагаешь зафиксировать для пересмотра?'
        if 'варианты' in stage:
            return 'Я могу рассмотреть поэтапный рост или комбинацию премии с пересмотром оклада. Какой пакет для тебя приоритетнее?'
        if 'условия и встречные' in stage:
            return 'Если мы договоримся о новых KPI и расширенной зоне ответственности, какие обязательства ты готов взять и к какой дате?'
        if 'фиксация' in stage:
            return 'Давай проверим итог: размер или диапазон, дата, критерии и кто запускает согласование. Что именно фиксируем?'
        if any(x in low for x in ('бюджет','стоимость','дорого','цена')): return 'Бюджет ограничен. Разложите предложение на обязательную и опциональную части и покажите эффект каждой.'
        if any(x in low for x in ('срок','дата','дедлайн','быстрее')): return 'Срок для меня критичен. Какие этапы, контрольные точки и риски вы готовы зафиксировать?'
        if '?' in message: return 'Для меня важны измеримый результат, управляемый риск и конкретный следующий шаг. Какой вариант вы предлагаете с учётом этих критериев?'
        variants=['Какой измеримый результат получит моя сторона и за какой срок?','Какие интересы моей стороны учитывает ваше предложение?','Какие два реалистичных варианта и следующий шаг вы готовы зафиксировать?']
        return variants[sum(ord(ch) for ch in message)%len(variants)]
    def chat_json(self,messages,model=None):
        system=messages[0].get('content','') if messages else ''; prompt=messages[-1].get('content','') if messages else ''
        if 'классификатор намерений' in system:
            result=self._classify(prompt)
            if 'одновременно классификатор' in system.lower():
                result['reply']=self.chat(messages,model)
            return result
        if 'эксперт по деловым переговорам' in system: return self._analysis(prompt)
        if 'проектировщик сценариев' in system: return self._scenario(prompt)
        return {}
    def _classify(self,prompt):
        m=re.search(r'Допустимые намерения:\s*(\[[^\n]*\])',prompt); intents=json.loads(m.group(1)) if m else []; text=_tail(prompt).lower()
        maps={'ask':('расскаж','какие','потребност','важно','критер'),'need':('потребност','задач','проблем'),'achievement':('результат','kpi','достижен','рост','%'),'market':('рынок','ставк'),'price':('цен','стоим','бюджет'),'solution':('решен','предлага','эффект'),'pilot':('пилот','тест'),'compromise':('компромисс','вариант','этап'),'agree':('соглас','фиксируем','договорились'),'terms':('услов','срок','метрик'),'ultimatum':('или','ультимат','увольня'),'threat':('угрож','увольня'),'discount':('скидк',),'mvp':('mvp','минимальн','поэтап'),'raise':('повыс','зарплат'),'agenda':('обсудить','тема','встреч'),'scope':('ответствен','роль','задач'),'specific':('прошу','процент','%','диапазон'),'metrics':('kpi','выруч','метрик','результат','%'),'value':('ценност','эффект','выгода'),'timeline':('когда','срок','дата'),'date':('дата','число','квартал'),'options':('вариант','поэтап','премия','бонус'),'package':('пакет','условия'),'confirm':('фиксируем','подтвержд','согласен'),'clarify':('уточним','зафиксируем','ответствен'),'budget':('бюджет','фонд'),'cost':('затрат','себестоим','рост цен'),'risk':('риск','понимаю','признаю'),'client':('клиент','заказчик','приоритет')}
        best='other'; score=0
        for intent in intents:
            current=sum(3 for token,words in maps.items() if token in intent and any(w in text for w in words))
            if current>score: best,score=intent,current
        pos=sum(x in text for x in self.positive); neg=sum(x in text for x in self.negative); off=any(x in text for x in ('погод','фильм','анекдот','рецепт'))
        return {'intent':best,'adjust':-5 if off else max(-20,min(15,3+pos*3-neg*9)),'off_topic':off,'resolution':'none'}
    def _analysis(self, prompt):
        user_lines = [line.split(':', 1)[1].strip() for line in prompt.splitlines() if line.startswith('Пользователь:')]
        text = ' '.join(user_lines)
        low = text.lower()
        turns = len(user_lines)
        scenario_match = re.search(r"Сценарий:\s*(.+)", prompt)
        goal_match = re.search(r"Цель:\s*(.+)", prompt)
        opponent_match = re.search(r"Роль оппонента:\s*(.+)", prompt)
        scenario_title = scenario_match.group(1).strip() if scenario_match else "текущий сценарий"
        scenario_goal = goal_match.group(1).strip() if goal_match else "договориться о следующем шаге"
        opponent_role = opponent_match.group(1).strip() if opponent_match else "собеседник"
        has_numbers = bool(re.search(r'\b\d+(?:[.,]\d+)?%?\b', text))
        has_results = any(x in low for x in ('результат', 'выруч', 'эконом', 'ускор', 'снизил', 'увеличил', 'рост', 'kpi', 'метрик'))
        has_scope = any(x in low for x in ('ответствен', 'роль', 'настав', 'команд', 'задач'))
        questions = sum(line.count('?') for line in user_lines)
        has_options = any(x in low for x in ('вариант', 'поэтап', 'преми', 'бонус', 'компромисс', 'пакет'))
        has_objection_work = any(x in low for x in ('понимаю', 'бюджет', 'если сейчас', 'в таком случае', 'альтернатив'))
        has_closing = any(x in low for x in ('фиксир', 'договор', 'подтверж', 'дата', 'срок', 'ответственн', 'следующ'))
        violation_match = re.search(r'Нарушений границ общения:\s*(\d+)', prompt)
        violations = int(violation_match.group(1)) if violation_match else 0
        pressure = sum(x in low for x in self.negative) + violations * 2

        structure = max(25, min(96, 38 + turns * 4 + (10 if has_closing else 0) + (6 if has_options else 0) - pressure * 12))
        evidence = max(20, min(98, 34 + (24 if has_numbers else 0) + (22 if has_results else 0) + (10 if has_scope else 0)))
        question_score = max(20, min(95, 34 + questions * 17 + (8 if has_objection_work else 0)))
        objections = max(20, min(96, 36 + (22 if has_objection_work else 0) + (17 if has_options else 0) + (8 if questions else 0) - pressure * 9))
        closing = max(20, min(98, 32 + (36 if has_closing else 0) + (14 if has_options else 0) + (8 if has_numbers else 0)))
        listening=max(20,min(96,38+questions*10+(18 if any(x in low for x in ('понимаю','правильно ли','верно ли','услышал','уточню')) else 0)))
        value=max(20,min(98,34+(18 if has_results else 0)+(16 if has_scope else 0)+(14 if any(x in low for x in ('выгода','эффект','ценность','для компании','для команды')) else 0)))
        composure=max(15,min(98,78+(7 if has_objection_work else 0)-pressure*22))
        skills={'structure':structure,'evidence':evidence,'questions':question_score,'listening':listening,'value':value,'objections':objections,'composure':composure,'closing':closing}
        score=max(20,min(96,round(sum(skills.values())/len(skills)+min(turns,8)-pressure*5)))

        quote = max(user_lines, key=len, default='').strip()
        if len(quote) > 110: quote = quote[:107].rstrip() + '…'
        praise = []
        if has_numbers and has_results: praise.append(f'Вы подкрепили позицию измеримыми результатами — например: «{quote}».')
        elif quote: praise.append(f'Вы сформулировали содержательную позицию: «{quote}».')
        if has_scope: praise.append('Вы связали запрос с расширением роли и ответственности, а не только с личным желанием.')
        if questions: praise.append(f'Вы задали {questions} уточняющих вопроса и вовлекали роль «{opponent_role}» в поиск решения.')
        if has_options: praise.append('Вы предлагали варианты и сохраняли пространство для взаимовыгодной договорённости.')
        if has_closing: praise.append('Вы пытались зафиксировать конкретный следующий шаг, сроки или условия.')
        if len(praise) < 2: praise.append(f'Вы удерживали деловой разговор на протяжении {turns} ходов и реагировали на позицию руководителя.')

        if violations:
            praise = [
                'Попытка дала конкретный материал для разбора границ профессионального общения.',
                'Начальная короткая реплика позволила быстро увидеть, какие формулировки уводят разговор от цели.',
            ]
        improvements = []
        if not has_numbers: improvements.append('Добавьте к аргументу конкретную цифру: исходное значение, ваш вклад и измеримый эффект.')
        if not has_results: improvements.append('Отделите личный вклад от результата команды: назовите своё действие и его бизнес-эффект.')
        if not questions: improvements.append('После возражения задайте открытый вопрос о критериях решения, а не переходите сразу к следующему аргументу.')
        elif questions < 2: improvements.append('Добавьте ещё один диагностический вопрос о бюджете, сроках или условиях согласования.')
        if not has_options: improvements.append(f'Предложите минимум два реалистичных варианта достижения цели: {scenario_goal}.')
        if not has_closing: improvements.append('В финале зафиксируйте решение, срок и ответственного за следующий шаг.')
        if pressure: improvements.append('Уберите давление и формулировки ультиматума; замените их обсуждением рисков и альтернатив.')
        if len(improvements) < 2: improvements.append('Сделайте финальную реплику короче: решение, дата и следующий шаг в одном предложении.')

        status = 'успешно завершилась' if 'Итог: success' in prompt else 'завершилась без полной договорённости'
        skill_labels = {'structure':'структура разговора','evidence':'аргументация фактами','questions':'качество вопросов','listening':'активное слушание','value':'ценность для другой стороны','objections':'работа с возражениями','composure':'эмоциональная устойчивость','closing':'фиксация договорённости'}
        best, growth = max(skills, key=skills.get), min(skills, key=skills.get)
        summary = f'Попытка в сценарии «{scenario_title}» {status} после {turns} ходов. Сильнее всего проявилась {skill_labels[best]}, а основная зона роста — {skill_labels[growth]}.'
        return {'praise':praise[:4],'improvements':improvements[:4],'summary':summary,'score':score,'skills':skills}
    def _scenario(self,prompt):
        raw=prompt.split('Описание сценария:',1)[-1].strip()
        def field(name,default=''):
            match=re.search(rf'^{re.escape(name)}:\s*(.+)$',raw,re.I|re.M)
            return match.group(1).strip() if match else default
        labelled=('Название:','Тема:','Роль пользователя:','Роль собеседника:','Его интерес или цель:','Цель пользователя:','Ограничения:')
        context=' '.join(line.strip() for line in raw.splitlines() if line.strip() and not line.startswith(labelled))[:900]
        low=(raw+' '+context).lower()
        if any(token in low for token in ('просроч','вернуть деньги','возврат','касс','чек')):
            category='consumer_refund'; default_title='Возврат товара: факты, подтверждение и решение'
            labels=('Факт покупки и проблема','Подтверждение покупки','Критерии возврата','Варианты решения','Оформление возврата')
        elif any(token in low for token in ('пилот','внедрен','завод','производств','линия','простой оборудования','простой линии')):
            category='pilot'; default_title='Пилотное внедрение: риски, критерии и безопасный запуск'
            labels=('Исходные условия производства','Риски простоя и внедрения','Критерии безопасного пилота','План пилота и границы','Ответственные и точка остановки')
        elif any(token in low for token in ('конфликт','коллег','команд','распределение ответственност','рабочая договорённост')):
            category='conflict'; default_title='Сложный разговор: факты и рабочая договорённость'
            labels=('Конкретный эпизод','Позиция второй стороны','Влияние на общую работу','Варианты правила','Фиксация ответственности')
        elif any(token in low for token in ('зарплат','повышен','карьер','компенсац','руководител')):
            category='career'; default_title='Карьерный разговор: вклад, запрос и условия'
            labels=('Результаты и вклад','Критерии решения','Конкретный запрос','Варианты при ограничениях','Фиксация решения')
        elif any(token in low for token in ('клиент','продаж','сделк','покупател','заказчик')):
            category='sales'; default_title='Переговоры с клиентом: задача, ценность и следующий шаг'
            labels=('Текущая ситуация клиента','Проблема и последствия','Критерии решения','Варианты предложения','Следующий шаг')
        elif any(token in low for token in ('поставщик','закуп','цена','контракт','условия')):
            category='procurement'; default_title='Переговоры об условиях: интересы, варианты и обмен'
            labels=('Причины позиции сторон','Интересы и ограничения','Объективные критерии','Пакеты условий','Фиксация обмена')
        else:
            category='general'; default_title='Переговоры по вашей ситуации'
            labels=('Факты и контекст','Интересы сторон','Критерии решения','Варианты решения','Фиксация следующего шага')
        requested_title=field('Название')
        title=default_title if not requested_title or 'сформулируй' in requested_title.lower() else requested_title[:120]
        user_role=field('Роль пользователя','определи по описанию')
        if 'определи' in user_role.lower() or user_role.lower() == 'участник переговоров':
            role_match=re.search(r'\bя\s+(покупатель|клиент|заказчик|поставщик|продавец|сотрудник|менеджер|руководитель продукта|руководитель проекта)\b',context,re.I)
            if role_match:user_role=role_match.group(1)
            elif category=='consumer_refund':user_role='Покупатель'
            else:user_role='Участник переговоров'
        opponent_role=field('Роль собеседника','определи по описанию')
        if 'определи' in opponent_role.lower() or opponent_role.lower() in ('собеседник', 'собеседник по ситуации'):
            explicit_role=re.search(r'собеседник\s*[—–:-]\s*([^.!?\n,;]{3,70})',context,re.I)
            if explicit_role:opponent_role=explicit_role.group(1).strip()
            elif category=='consumer_refund':opponent_role='Администратор магазина'
            elif category=='pilot':opponent_role='Директор производства'
            else:opponent_role='Собеседник по ситуации'
        opponent_goal=field('Его интерес или цель','защищает свои интересы и проверяет реалистичность предложения')
        goal=field('Цель пользователя','Договориться о конкретном и проверяемом следующем шаге')
        if 'определи' in goal.lower():
            goal='Вернуть деньги или согласовать корректный возврат товара' if category=='consumer_refund' else 'Договориться о конкретном и проверяемом следующем шаге'
        constraints=[x.strip() for x in re.split(r'[;\n]',field('Ограничения')) if x.strip() and x.strip().lower()!='не заданы']
        if not constraints: constraints=['не использовать давление и угрозы','проверять интересы обеих сторон']
        nodes=[
            {'id':'start','type':'start','label':'Открытие разговора','description':f'Задайте рамку разговора с {opponent_role.lower()} и обозначьте тему.','interest_delta':0,'prompt_hint':f'Я готов обсудить ситуацию. С чего вы хотите начать?'},
            {'id':'context','type':'phase','label':labels[0],'description':f'Уточните наблюдаемые факты именно этой ситуации: {context[:220] or goal}.','interest_delta':4,'coach_hint':'Назовите один факт без оценки и задайте один открытый вопрос.','coach_focus':['факты','контекст'],'watch_for':['конкретный эпизод'],'avoid':['обобщения']},
            {'id':'interests','type':'phase','label':labels[1],'description':f'Выясните, что важно второй стороне: {opponent_goal}.','interest_delta':6,'knowledge_refs':['spin-question-sequence'],'coach_hint':'Не спорьте с позицией; уточните стоящий за ней интерес.','coach_focus':['интересы','вопросы'],'watch_for':['открытый вопрос'],'avoid':['презентация до исследования']},
            {'id':'criteria','type':'phase','label':labels[2],'description':'Согласуйте, по каким признакам стороны поймут, что решение работает.','interest_delta':6,'knowledge_refs':['spin-question-sequence'],'coach_hint':'Переведите общие пожелания в один проверяемый критерий.','coach_focus':['критерии','последствия'],'watch_for':['срок','результат'],'avoid':['размытые обещания']},
            {'id':'options','type':'phase','label':labels[3],'description':'Соберите два реалистичных варианта с учётом ограничений сторон.','interest_delta':7,'coach_hint':'Предложите выбор, а не одно требование.','coach_focus':['варианты','взаимная выгода'],'watch_for':['два варианта'],'avoid':['ультиматум']},
            {'id':'agreement','type':'phase','label':labels[4],'description':f'Зафиксируйте решение, владельца, срок и следующий контакт ради цели: {goal}.','interest_delta':9,'coach_hint':'Повторите договорённость одной короткой фразой и проверьте согласие.','coach_focus':['закрытие','следующий шаг'],'watch_for':['кто','что','когда'],'avoid':['оставить решение устным и общим']},
            {'id':'success','type':'end','label':'Проверяемая договорённость достигнута','description':'Стороны согласовали решение и следующий шаг.','outcome':'success'},
            {'id':'failure','type':'end','label':'Разговор зашёл в тупик','description':'Давление или отказ слышать вторую сторону сорвали переговоры.','outcome':'failure'}
        ]
        objections={
            'consumer_refund': ('Проверка товара и чека', 'Собеседнику нужно подтвердить покупку, состояние товара и допустимый способ возврата.', 'provide_purchase_evidence'),
            'pilot': ('Остановка линии и безопасность', 'Собеседник требует ограничить простой, бюджет и риск для производства до запуска пилота.', 'propose_safe_pilot'),
            'conflict': ('Недоверие между сторонами', 'Собеседник не готов принять одностороннее распределение ответственности.', 'acknowledge_concern'),
            'career': ('Бюджет и полномочия', 'Собеседник не может пообещать повышение без бюджета и согласования.', 'propose_kpi_plan'),
            'sales': ('Риски пилота', 'Собеседник хочет ограничить риск внедрения, срок и стоимость пилота.', 'propose_pilot'),
            'procurement': ('Условия поставки', 'Собеседник связывает цену со сроками и обязательствами сторон.', 'present_package'),
        }
        if category in objections:
            label, obstacle, recovery_intent=objections[category]
            nodes.insert(-2, {'id':'objection','type':'phase','label':label,
                'description':f'{obstacle} Учитывайте конкретную ситуацию: {context[:160]}',
                'interest_delta':-2,'coach_hint':'Признайте ограничение и предложите проверяемый встречный вариант.',
                'coach_focus':['возражение','обмен условиями'],'watch_for':['вариант','критерий'],'avoid':['давление']})
        edges=[
            {'from':'start','to':'context','trigger':{'type':'intent','value':'set_agenda'}},
            {'from':'start','to':'failure','trigger':{'type':'intent','value':'attack_person'}},
            {'from':'context','to':'interests','trigger':{'type':'intent','value':'ask_perspective'}},
            {'from':'context','to':'criteria','trigger':{'type':'intent','value':'identify_criteria'}},
            {'from':'interests','to':'criteria','trigger':{'type':'intent','value':'explore_consequences'}},
            {'from':'interests','to':'options','trigger':{'type':'intent','value':'propose_options'}},
            {'from':'interests','to':'failure','trigger':{'type':'intent','value':'ultimatum'}},
            {'from':'criteria','to':'options','trigger':{'type':'intent','value':'propose_options'}},
            {'from':'criteria','to':'agreement','trigger':{'type':'intent','value':'propose_terms'}},
            {'from':'options','to':'agreement','trigger':{'type':'intent','value':'negotiate_terms'}},
            {'from':'options','to':'criteria','trigger':{'type':'intent','value':'clarify_terms'}},
            {'from':'options','to':'failure','trigger':{'type':'intent','value':'threaten'}},
            {'from':'agreement','to':'success','trigger':{'type':'intent','value':'confirm_agreement'}},
            {'from':'agreement','to':'options','trigger':{'type':'intent','value':'refine_terms'}},
            {'from':'agreement','to':'failure','trigger':{'type':'intent','value':'reject_all'}}
        ]
        if category in objections:
            edges.extend([
                {'from':'criteria','to':'objection','trigger':{'type':'intent','value':'ask_about_risks'}},
                {'from':'options','to':'objection','trigger':{'type':'intent','value':'discuss_constraints'}},
                {'from':'objection','to':'options','trigger':{'type':'intent','value':recovery_intent}},
                {'from':'objection','to':'criteria','trigger':{'type':'intent','value':'clarify_criteria'}},
                {'from':'objection','to':'failure','trigger':{'type':'intent','value':'ultimatum'}}
            ])
        return {'title':title,'description':context or raw[:900],'difficulty':'medium','industry':field('Тема',category),'goal':goal,'user_role':user_role,'constraints':constraints,'opponent':{'role':opponent_role,'style':opponent_goal,'tone':'деловой и уважительный'},'assistant':{'role':'Переговорный коуч Фиделина','style':'даёт один конкретный следующий шаг по реплике пользователя','tone':'дружелюбный'},'interest':{'start':50,'min':0,'max':100},'graph':{'nodes':nodes,'edges':edges},'tags':[category],'knowledge_refs':['spin-question-sequence'],'coach_profile':{'focus':['интересы','критерии','следующий шаг'],'default_hint':'Опирайся на факты разговора и предложи только один следующий ход.'}}

class ResilientLLM(BaseLLM):
    """Cloud-first provider with observable automatic expert failover."""
    def __init__(self, primary, fallback=None): self.primary=primary;self.fallback=fallback or ExpertLLM();self.settings=getattr(primary,"settings",None);self.last_call={}
    def _run(self,method,messages,model=None):
        started=time.perf_counter()
        try:
            value=getattr(self.primary,method)(messages,model);kind=getattr(self.primary,"last_kind",None) or ("smart" if method=="chat_json" else "dialog");self.last_call={"responder":"cloud_ai","model":getattr(self.primary,"last_model",None) or model or (self.settings.smart_model if kind=="smart" else self.settings.dialog_model),"model_kind":kind,"fallback_used":False,"latency_ms":round((time.perf_counter()-started)*1000)};return value
        except LLMError:
            value=getattr(self.fallback,method)(messages,model);self.last_call={"responder":"expert_system","model":"expert-rules-v2","fallback_used":True,"latency_ms":round((time.perf_counter()-started)*1000)};return value
    def chat(self,messages,model=None):return self._run("chat",messages,model)
    def chat_json(self,messages,model=None):return self._run("chat_json",messages,model)

class MockLLM(ExpertLLM):
    def __init__(self,reply='Хорошо, продолжим.',json_spec=None): self.reply,self.json_spec=reply,json_spec
    def chat(self,messages,model=None): return self.reply
    def chat_json(self,messages,model=None): return self.json_spec if self.json_spec is not None else super().chat_json(messages,model)

def _tail(text):
    m=re.findall(r"['\"]([^'\"]{2,})['\"]",text); return m[-1] if m else text[-1200:]
def _extract_json(raw):
    raw=raw.strip(); fence=re.search(r'```(?:json)?\s*(.*?)```',raw,re.S|re.I)
    if fence: raw=fence.group(1).strip()
    else:
        a,b=raw.find('{'),raw.rfind('}'); raw=raw[a:b+1] if a!=-1 and b>a else raw
    try: return json.loads(raw)
    except json.JSONDecodeError as exc: raise LLMError('Модель вернула некорректный JSON.') from exc
