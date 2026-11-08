import test from 'node:test';
import assert from 'node:assert/strict';
import {quickGenesisPrompt,genesisPrompt} from '../public/logic.mjs';

const world={name:'Гарри Поттер AU',genre:'Фэнтези',premise:'Лондон',clock_start:'1980-07'};
const infant={hero_name:'Гарри Поттер',hero_age:'0',npc_count:'2',birth_date:'1980-07-31',simulation_mode:'life',
 quick_answers:['confront','plan','freedom','autonomous']};
test('birth-first Genesis forbids pre-authoring childhood or predetermined adult psychology',()=>{
 const a=genesisPrompt(world,infant),b=quickGenesisPrompt(world,infant);
 assert.match(a,/СТАРТ С РОЖДЕНИЯ/);
 assert.match(a,/Не придумывай его детство/);
 assert.match(b,/У младенца НЕТ сыгранных решений/);
 assert.match(b,/без выдуманных прожитых лет/);
});
test('adult Genesis retains normal historical modeling',()=>{
 const text=genesisPrompt(world,{...infant,hero_age:'18',simulation_mode:'off'});
 assert.doesNotMatch(text,/СТАРТ С РОЖДЕНИЯ/);
});
