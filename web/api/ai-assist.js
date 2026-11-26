'use strict';
// 생성형 AI 보조(자연어 조건 정리·일정 설명). 키가 없으면 GET 은 {enabled:false}, POST 는 unavailable.
const {serve}=require('../server/ai-assistant.cjs');
module.exports=(req,res)=>serve(req,res);
