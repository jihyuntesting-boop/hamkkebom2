"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {names,svg,choice,stopArt,facilityArt}=require("../web/assets/scripts/04-illustrations.js");
test("original illustration library uses fixed local accessible SVG with no active or external content",()=>{
 assert.ok(names.length>=30);
 assert.equal(new Set(names).size,names.length);
 for(const name of names){const html=svg(name);assert.match(html,/aria-hidden="true"/);assert.match(html,/focusable="false"/);assert.doesNotMatch(html,/<(?:script|image|foreignObject|text|a)\b|\bon\w+=|\bhref=/i);}
 assert.equal(svg("constructor"),"");assert.equal(svg("<script>"),"");assert.ok(!names.some(x=>/mascot|character/i.test(x)));
});
test("illustrations map existing values without inventing additional choices",()=>{
 assert.equal(choice("need","wheelchair"),"wheelchair");assert.equal(choice("stairs","impossible"),"stairs");assert.equal(choice("fatigue","high"),"face-high");assert.equal(choice("interest","food"),"food");assert.equal(choice("interest","sea"),"");assert.equal(choice("constructor","x"),"");assert.equal(stopArt("rest"),"coffee");assert.equal(stopArt("food"),"food");assert.equal(facilityArt("엘리베이터"),"elevator");assert.equal(facilityArt("확인되지 않음"),"");
});
