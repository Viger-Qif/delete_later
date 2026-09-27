from __future__ import annotations
import time
from collections import deque
from app.core.config import get_settings
from app.llm.base import BaseLLM, ExpertLLM, LLMError, LLMQuotaError, MockLLM, ResilientLLM, UnikeyLLM
_provider=None
_cloud_provider=None
_expert_provider=None
_runtime_history=deque(maxlen=50)
def get_llm(force_mock=False):
 global _provider
 if force_mock:return MockLLM()
 if _provider is None:
  st=get_settings();_provider=ResilientLLM(UnikeyLLM(st),ExpertLLM()) if st.unikey_api_key else ExpertLLM()
 return _provider
def get_llm_for_mode(mode='auto'):
 global _cloud_provider,_expert_provider
 if mode=='auto':return get_llm()
 if mode=='expert':
  if _expert_provider is None:_expert_provider=ExpertLLM()
  return _expert_provider
 if mode=='cloud':
  st=get_settings()
  if not st.unikey_api_key:raise LLMError('Облачный ИИ не настроен: отсутствует API-ключ.')
  if _cloud_provider is None:
   _cloud_provider=UnikeyLLM(st);_cloud_provider.strict=True
  return _cloud_provider
 raise LLMError(f'Неизвестный режим движка: {mode}')
def runtime_info(provider,elapsed_ms=0):
 last=getattr(provider,'last_call',None) or {}
 if isinstance(provider,ResilientLLM): default='expert_system' if last.get('fallback_used') else 'cloud_ai';model=last.get('model') or ('expert-rules-v2' if default=='expert_system' else provider.settings.dialog_model)
 elif isinstance(provider,UnikeyLLM):default='cloud_ai';model=getattr(provider,'last_model',None) or provider.settings.dialog_model
 elif isinstance(provider,MockLLM):default='test_double';model='mock-llm'
 else:default='expert_system';model='expert-rules-v2'
 info={'responder':last.get('responder',default),'model':last.get('model',model),'fallback_used':bool(last.get('fallback_used',False)),'latency_ms':int(last.get('latency_ms') or elapsed_ms or 0)}
 _runtime_history.append(info.copy());return info
def credit_status():
 p=get_llm();primary=p.primary if isinstance(p,ResilientLLM) else p;b=getattr(primary,'credit_balance',None)
 return {'available':b is not None,'balance':b,'usage_total_tokens_observed':getattr(primary,'usage_total_tokens',0),'note':'Баланс получен из ответа провайдера.' if b is not None else 'Провайдер не отдаёт подтверждённый остаток кредитов через используемый API.'}
def provider_name():return 'cloud+expert-fallback' if isinstance(get_llm(),ResilientLLM) else 'expert-system'
def models_status(probe=False):
 st=get_settings();t=time.perf_counter();e=get_llm_for_mode('expert');reply=e.chat([{'role':'user','content':'Ответь одним словом: готов'}])
 out={'checked_at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'recommended_mode':'auto','expert':{'configured':True,'available':bool(reply),'model':'expert-rules-v2','latency_ms':round((time.perf_counter()-t)*1000),'error':None},'cloud':{'configured':bool(st.unikey_api_key),'available':None if not probe else False,'model':st.dialog_model,'smart_model':st.smart_model,'latency_ms':None,'error':None if st.unikey_api_key else 'API-ключ не настроен'}}
 if probe and st.unikey_api_key:
  try:
   from app.llm import registry as _reg;_reg.probe(force=True)
  except Exception:pass
  t=time.perf_counter()
  try:r=get_llm_for_mode('cloud').chat([{'role':'system','content':'Проверка. Ответь только OK.'},{'role':'user','content':'OK'}]);out['cloud'].update(available=bool(r),latency_ms=round((time.perf_counter()-t)*1000),error=None)
  except Exception as x:out['cloud'].update(available=False,latency_ms=round((time.perf_counter()-t)*1000),error=str(x))
 ca=[x for x in _runtime_history if x['responder']=='cloud_ai' or x['fallback_used']];out['cloud']['recent_success_rate']=round(100*sum(not x['fallback_used'] for x in ca)/len(ca)) if ca else None;out['cloud']['recent_attempts']=len(ca);out['expert']['recent_answers']=sum(x['responder']=='expert_system' for x in _runtime_history)
 try:
  from app.llm import registry as _reg
  snap=_reg.snapshot();out['candidates']=snap;out['probe_checked_at']=snap.get('checked_at')
  if st.unikey_api_key:
   act=_reg.active_model('dialog');sm=_reg.active_model('smart')
   if act:out['cloud']['model']=act
   if sm:out['cloud']['smart_model']=sm
   alive=[r for r in snap.get('dialog',[]) if r.get('available')]
   if alive and out['cloud'].get('available') is not True:out['cloud'].update(available=True,latency_ms=alive[0].get('latency_ms'),error=None)
 except Exception as exc:out['candidates']={'error':str(exc),'dialog':[],'smart':[]}
 return out
__all__=['BaseLLM','ExpertLLM','LLMError','LLMQuotaError','MockLLM','ResilientLLM','UnikeyLLM','get_llm','get_llm_for_mode','runtime_info','models_status','provider_name','credit_status']
