/*
大猫bot使用说明书 =>控制台输入help即可
*/
const e = RESOURCE_ENERGY, p = RESOURCE_POWER, onlyBuild = ['storage', 'extractor', 'terminal', 'factory', 'observer', 'powerSpawn', 'nuker'];
const nir = ERR_NOT_IN_RANGE,npc = 'Invader';
const bar ={
    'oxidant' : 'Obar',
    'purifier' : 'Xbar',
    'reductant' : 'Hbar',
    'utrium_bar' : 'Ubar',
    'lemergium_bar' : 'Lbar',
    'keanium_bar' : 'Kbar',
    'zynthium_bar' : 'Zbar',
    'ghodium_melt' : 'Gbar'
}
var showPlayerBool = false,showAllRoomBool = false,showAllCreepTaskBool = false,showAllCreepUsedCpuBool = false,creepCount;
module.exports.loop = function () {
    if(Game.shard.name == 'sim')return console.log('这里[sim]用不了,请在官服或者私服放')
    creepCount = Object.keys(Game.creeps).length
    if(showPlayerBool){
        var beginCPU = Game.cpu.getUsed();
        var gcl = Game.gcl
        var gpl = Game.gpl
        console.log('[玩家]',Memory.playerName,'[房间数]:',Object.keys(Memory.rooms).length,'[gcl',gcl.level,'进度:',((gcl.progress * 100) / gcl.progressTotal).toFixed(3) + '%][gpl:',gpl.level,'进度:',((gpl.progress * 100) / gpl.progressTotal).toFixed(3),'%]')
    }
    if (!Memory.rooms) newGame();
    getPixel();//搓pixel
    clearCreep(100);//100tick清一次死爬内存

    if (Object.keys(Game.constructionSites).length > 0) roomNewBuild()//缓存房间内新建筑(不包括外矿建筑)

    //处理房间
    dealRoom();

    //处理旗子
    dealFlag();

    //处理过道
    dealAisle();

    //处理爬爬
    var creepCpu = dealCreep();

    if(showPlayerBool){
        let nowCpu = Game.cpu.getUsed()
        var useCpu = nowCpu - beginCPU
        console.log('[TICK:',Game.time,'][shard:',Game.shard.name,'][BUCKET:', Game.cpu.bucket,']')
        console.log('[CREEP_CPU]:',creepCpu.toFixed(4),'[avg]:',(creepCpu / creepCount).toFixed(4))
        console.log('[OTHER_CPU]:',(useCpu - creepCpu).toFixed(4),'[CREEP]:',creepCount,'[CPU]:',Math.ceil(nowCpu))
        showPlayerBool = false
    }
}

function dealRoom(){
    if(showAllRoomBool){
        var str = '官服:' + Game.shard.name
        if(sifu) str = '私服:' + Game.shard.name
        console.log(str+'  房间数:' + Object.keys(Memory.rooms).length)
    }
   
    for (var roomName in Memory.rooms) {
        var str = Game.shard.name,roomCpu = Game.cpu.getUsed()
        var room = Game.rooms[roomName]
        //清理不是自己的房间内存
        if (!room || !room.controller || !room.controller.my) {
            delete Memory.rooms[roomName]
            continue
        }
        var controller = room.controller
        var spawn = getSpawn(roomName)
        if (!spawn) continue
        var f_spawning = spawn.spawning
        var controller = room.controller
        var storage = room.storage
        var terminal = room.terminal
        var level = Memory.rooms[roomName]['level']
        if(level >= 3 && level < 7){
            let deadCreep = s_p(Memory.rooms[roomName]['center'],roomName).lookFor(LOOK_CREEPS)[0]
            if(deadCreep){
                if(deadCreep.store[e] > 0){
                    let target = deadCreep.pos.findInRange(FIND_STRUCTURES,1,{filter:s=>s.store.getFreeCapacity(e) > 0})[0]
                    if(target)deadCreep.transfer(target,e);
                }else deadCreep.suicide();
            }
        }
        var state = Memory.rooms[roomName]['state']
        //自动sf
        if(!Memory.rooms[roomName]['ramparts_sf']){
            Memory.rooms[roomName]['ramparts_sf'] = {};
        }else{
            if((level >= 6 && state == 's' && Game.time % 10 == 0) || controller.safeMode){
                Memory.rooms[roomName]['ramparts_sf'] = {};
                room.find(FIND_STRUCTURES,{filter:s=>s.structureType == 'rampart' && s.hits > 100000}).forEach(ram=>{
                    Memory.rooms[roomName]['ramparts_sf'][ram.id] = ram.hits
                })
            }
            if(state == 'd' && !controller.safeMode){
                for(let ramID in Memory.rooms[roomName]['ramparts_sf']){
                    let rampart = Game.getObjectById(ramID)
                    if(!rampart || rampart.hits < 10000){
                        if(controller.safeModeAvailable > 0)controller.activateSafeMode();
                    }
                }
            }
        }
        //升级时调整配置
        if (controller.level > level) {
            var uplevel = ++Memory.rooms[roomName]['level']
            jumpToRoom(roomName,'升级 => ' + uplevel,0)
            switch (uplevel) {
                case 2:
                    if(Memory.rooms[roomName]['creeps']['work_source']['num'] > 4)Memory.rooms[roomName]['creeps']['work_source']['num'] = 4
                    Memory.rooms[roomName]['creeps']['work_up']['num'] = 1
                    break
                case 3:
                    Memory.rooms[roomName]['creeps']['work_source']['num'] = 2
                    Memory.rooms[roomName]['creeps']['work_up']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_build']['num'] = 3
                    Memory.rooms[roomName]['creeps']['work_carry']['num'] = 3
                    break;
                case 4:
                    Memory.rooms[roomName]['creeps']['work_up']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_build']['num'] = 3
                    break;
                case 5:
                    Memory.rooms[roomName]['creeps']['work_up']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_build']['num'] = 2
                    Memory.rooms[roomName]['creeps']['work_carry']['num'] = 2
                    break;
                case 6:
                    var mineral = Game.getObjectById(Memory.rooms[roomName]['mineral']['id'])
                    var centerpos = s_p(Memory.rooms[roomName]['controlCenter'], roomName)
                    var costs = new PathFinder.CostMatrix;
                    room.find(FIND_STRUCTURES).forEach(function (s) {
                        var type = s.structureType;
                        if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                        else if (!s.my || (s.structureType != 'container' && s.structureType != 'rampart')) costs.set(s.pos.x, s.pos.y, 255)
                    })
                    var pack = BG_path(centerpos, mineral.pos, 1, costs)
                    var r = Object.keys(Memory.rooms[roomName]['build_BigCat'][6]['road/s'])[Object.keys(Memory.rooms[roomName]['build_BigCat'][6]['road/s']).length - 1]
                    mineral_path = pack.path
                    for (var pos of mineral_path) {
                        if (Math.abs(pos.x - centerpos.x) < 3 && Math.abs(pos.y - centerpos.y) <= 3) continue
                        costs.set(pos.x, pos.y, 1)
                        Memory.rooms[roomName]['build_BigCat'][6]['road/s'][r++] = pos.x + '/' + pos.y
                    }
                    Memory.rooms[roomName]['creeps']['work_carry']['num'] = 2
                    Memory.rooms[roomName]['creeps']['work_wall']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_build']['num'] = 2
                    Memory.rooms[roomName]['creeps']['work_up']['num'] = 1
                    break;
                case 7:
                    Memory.rooms[roomName]['creeps']['work_wall']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_up']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_carry']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_build']['num'] = 2
                    break;
                case 8:
                    Memory.rooms[roomName]['creeps']['work_wall']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_up']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_carry']['num'] = 1
                    Memory.rooms[roomName]['creeps']['work_build']['num'] = 2
                    break;
            }
            newBuild(roomName, uplevel)
        }
        //终端/lab
        if (level >= 6) {
            if(terminal && terminal.cooldown == 0)dealTerminal(storage,roomName,terminal);
            var labsHave = Memory.rooms[roomName]['lab']['labs'].length
            if ((!labsHave || labsHave < 10) && Game.time % 100 == 0) {
                if (!labsHave || (level == 8 && labsHave < 10) || (level == 7 && labsHave < 6) || (level == 6 && labsHave < 3)) {
                    labsInit(level, room, roomName)
                }
            }
            if(labsHave >= 3)centerLab(roomName)
            if(!Memory.rooms[roomName]['rubbish']){
                Memory.rooms[roomName]['rubbish'] = {}
                Memory.rooms[roomName]['rubbish']['id'] = null;
                Memory.rooms[roomName]['rubbish']['pos'] = (storage.pos.x + 1) + '/' + (storage.pos.y - 1)
                s_p(Memory.rooms[roomName]['rubbish']['pos'],roomName).createConstructionSite('container')
            }
        }
        //工厂
        if(level >= 7){
            var factory = Game.getObjectById(Memory.rooms[roomName]['factory']['id'])
            if(factory){
                dealFactory(roomName,factory)
            }else if(Game.time % 100 == 0){
                factory = room.find(FIND_STRUCTURES,{filter:s=>s.structureType == 'factory'})[0]
                if(factory)Memory.rooms[roomName]['factory']['id'] = factory.id
            }
        }
        //过道
        if(level == 8 && Memory.rooms[roomName]['aisle']['open'] && Memory.rooms[roomName]['aisle']['outName'] && Memory.rooms[roomName]['aisle']['outName'].length > 0){
            let ob = Game.getObjectById(Memory.rooms[roomName]['observer'])
            if(ob){
                //找过道
                if(Memory.rooms[roomName]['aisle']['open'] && !Memory.rooms[roomName]['aisle']['findfind']){
                    findAisle(roomName)
                }
                //ob
                if(Memory.rooms[roomName]['aisle']['begin']){
                    var i = Memory.rooms[roomName]['aisle']['i']
                    if(i === undefined)Memory.rooms[roomName]['aisle']['i'] = 1
                    //获取ob房间名字
                    var outName = Memory.rooms[roomName]['aisle']['outName'][i]
                    if(!Memory.aisle[outName]){
                        //房间
                        var outRoom = Game.rooms[Memory.rooms[roomName]['aisle']['outName'][i]]
                        //没有就ob,有就i++
                        if(!outRoom){
                            ob.observeRoom(outName)
                        }else{
                            let deposit = outRoom.find(FIND_DEPOSITS,{filter:s=>s.cooldown < 100})[0]
                            if(deposit){
                                jumpToRoom(outName,0,'发现沉淀物 ' + deposit.depositType)
                                Memory.aisle[outName] = {}
                                Memory.aisle[outName]['id'] = deposit.id
                                Memory.aisle[outName]['pos'] = p_s(deposit.pos);
                                Memory.aisle[outName]['type'] = deposit.depositType
                                const terrain = new Room.Terrain(roomName)
                                let workCreepCount = 0
                                for(let x = deposit.pos.x - 1;x <= deposit.pos.x + 1;x++){
                                    for(let y = deposit.pos.y - 1;y <= deposit.pos.y + 1;y++){
                                        if(terrain.get(x,y) != TERRAIN_MASK_WALL){
                                            workCreepCount++
                                        }
                                    }
                                }
                                Memory.aisle[outName]['count'] = workCreepCount
                                Memory.aisle[outName]['obName'] = roomName
                                Memory.aisle[outName]['tick'] = Game.time + powerBank.ticksToDecay - 200
                            }else {
                                let powerBank = outRoom.find(FIND_STRUCTURES,{filter:s=>s.structureType = STRUCTURE_POWER_BANK && s.power > 1000 && s.ticksToDecay >= 2000})[0]
                                if(powerBank){
                                    jumpToRoom(outName,0,'发现抛瓦 ' + powerBank.power + ' 个,剩余时间 ' + powerBank.ticksToDecay + ' ticks')
                                    Memory.aisle[outName] = {}
                                    Memory.aisle[outName]['id'] = powerBank.id
                                    Memory.aisle[outName]['pos'] = p_s(powerBank.pos);
                                    Memory.aisle[outName]['type'] = 'power'
                                    Memory.aisle[outName]['amount'] = powerBank.power
                                    Memory.aisle[outName]['carryCount'] = Math.ceil(powerBank.power / 1250)
                                    Memory.aisle[outName]['tick'] = Game.time + powerBank.ticksToDecay - 1500
                                }else Memory.rooms[roomName]['aisle']['i']++
                            }
                        }
                    }else Memory.rooms[roomName]['aisle']['i']++
                    //顺序
                    if(i >= Memory.rooms[roomName]['aisle']['outName'].length - 1){
                        Memory.rooms[roomName]['aisle']['i'] = 1
                        Memory.rooms[roomName]['aisle']['tick'] = Game.time + 10 + Math.random() * 5
                        Memory.rooms[roomName]['aisle']['begin'] = false
                    }
                }else{
                    if(!Memory.rooms[roomName]['aisle']['tick'])Memory.rooms[roomName]['aisle']['tick'] = Game.time
                    if(Memory.rooms[roomName]['aisle']['tick'] < Game.time){
                        Memory.rooms[roomName]['aisle']['begin'] = true
                    }
                }
            }else if(Game.time % 21 == 0){
                ob = room.find(FIND_STRUCTURES,{filter:s=>s.structureType == 'observer'})[0]
                if(ob)Memory.rooms[roomName]['observer'] = ob.id
            }
            for(var outName of Memory.rooms[roomName]['aisle']['outName']){
                Game.map.visual.line(new RoomPosition(25,25,outName),new RoomPosition(25,25,roomName))
            }
        }
        if(Game.market.credits < 500000 && Game.resources['pixel'] > 10){
            dealSell(0,'pixel',1)
        }
        //房间内是否有工地
        if (Game.time % 10 == 0 && !Memory.rooms[roomName]['building']) Memory.rooms[roomName]['building'] = room.find(FIND_CONSTRUCTION_SITES).length > 0
        //房间内是否有敌人
        if (Game.time % 10 == 0 && state == 's') {
            var enemys = room.findEnemys()
            if (enemys.length > 0){
                Memory.rooms[roomName]['state'] = 'd'
                state = 'd'
                var enemyCount = 0,npcCount = 0,enemyNames = [];
                for(var enemy of enemys){
                    var enemyName = enemy.owner.username
                    if(enemyNames.indexOf(enemyName) == -1)enemyNames.push(enemyName)
                    if(enemyName != npc){ 
                        if(enemy.getActiveBodyparts(ATTACK) > 0 || enemy.getActiveBodyparts(RANGED_ATTACK) > 0 || enemy.getActiveBodyparts(HEAL) > 0 || enemy.getActiveBodyparts(WORK) > 0){
                            enemyCount++
                        }
                    }
                }
                jumpToRoom(roomName,0,'房间内有敌人:' + enemyNames);
                if(npcCount < enemyCount && enemyCount > 2){
                    Memory.rooms[roomName]['creeps']['work_defend']['num']++
                }
            }
        }
        //炮台打房间内的敌人
        if (state == 'd') {
            towerAttack(room)
            if(!Memory.rooms[roomName]['enemys'])Memory.rooms[roomName]['enemys'] = {};
            var enemys = room.findEnemys()

        }
        //缓存的需要维护建筑的数量
        var repairamount = Object.keys(Memory.rooms[roomName]['repair']).length
        //寻找需要维护的建筑并缓存
        if ((repairamount == 0 && Game.time % 100 == 0) || Memory.rooms[roomName]['building']) {
            var repairs = []
            room.find(FIND_STRUCTURES, { filter: s => (s.structureType != STRUCTURE_WALL && s.hits / s.hitsMax < 0.8) || (s.structureType == 'rampart' && s.hits < 10000) }).forEach(r => {
                repairs = repairs.concat([r.id])
            })
            if (repairs.length > 0) {
                for (var i = 0; i < repairs.length; i++) {
                    Memory.rooms[roomName]['repair'][i] = repairs[i]
                }
            }
        }
        //维护
        if (repairamount > 0) {
            if (level <= 3) {
                if(!f_spawning && Memory.rooms[roomName]['creeps']['work_repair']['name'].length < Memory.rooms[roomName]['creeps']['work_repair']['num']){
                    var creepName = randomName()
                    var body = [WORK,CARRY,MOVE]
                    var type = roomName + '/home/repair'
                    var spawn_f = spawn.spawnCreep(body, creepName,{memory:{workType : type}})
                    if (spawn_f == OK){
                        f_spawning = true
                        for(var i = 0;i <Memory.rooms[roomName]['creeps']['work_repair']['num'];i++){
                            if(!Memory.rooms[roomName]['creeps']['work_repair']['name'][i]){
                                Memory.rooms[roomName]['creeps']['work_repair']['name'][i] = creepName
                                break;
                            }
                        }
                    }
                }
            } else if(state == 's'){
                if (!Memory.rooms[roomName]['repairTower']) Memory.rooms[roomName]['repairTower'] = room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_TOWER })[0].id
                else {
                    var tower = Game.getObjectById(Memory.rooms[roomName]['repairTower'])
                    if (!tower) Memory.rooms[roomName]['repairTower'] = null
                    else {
                        for (var i in Memory.rooms[roomName]['repair']) {
                            var target = Game.getObjectById(Memory.rooms[roomName]['repair'][i])
                            if (tower && tower.store[e] > 0) {
                                if (target && ((target.structureType != 'rampart' && target.hits < target.hitsMax) || (target.structureType == 'rampart' && target.hits < 10000))) {
                                    tower.repair(target)
                                } else delete Memory.rooms[roomName]['repair'][i]
                            }
                            break
                        }
                    }
                }
            }
        } else {
            if (state == 's' && level == 6) {
                var repairrampart = room.find(FIND_STRUCTURES, { filter: s => s.structureType == 'rampart' && s.hits < 10000 })[0]
                room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_TOWER }).forEach(t => {
                    t.repair(repairrampart)
                })
            }
        }
        
        //中心link
        if (!Memory.rooms[roomName]['control_center'] && level >= 5 && Game.time % 20 == 0) {
            var link = s_p(Memory.rooms[roomName]['control_link'], roomName).lookFor(LOOK_STRUCTURES)[0]
            if (link) Memory.rooms[roomName]['control_center'] = link.id
        } else {
            if (level >= 7 && !Memory.rooms[roomName]['centerEnergyLink'] && Game.time % 20 == 0) {
                var energyLink = s_p(Memory.rooms[roomName]['center'], roomName).lookFor(LOOK_STRUCTURES)[0]
                if (energyLink) Memory.rooms[roomName]['centerEnergyLink'] = (energyLink).id
            } else {
                var energyLink = Game.getObjectById(Memory.rooms[roomName]['centerEnergyLink'])
                if (energyLink && energyLink.store[e] < 500) {
                    room.find(FIND_STRUCTURES, { filter: s => s.structureType == 'link' && s.pos.getRangeTo(energyLink) > 6 && s.store[e] >= 700 }).forEach(l => { l.transferEnergy(energyLink) })
                } else {
                    var link = Game.getObjectById(Memory.rooms[roomName]['control_center'])
                    if (link && link.store[e] < 790) {
                        room.find(FIND_STRUCTURES, { filter: s => s.structureType == 'link' && s.pos.getRangeTo(link) > 6 && s.store[e] >= 700 }).forEach(l => { l.transferEnergy(link) })
                    }
                }
            }
        }
        
        if (level > 1){
            if(level < 7 && storage){
                if(Memory.rooms[roomName]['creeps']['work_up']['num'] == 1){
                    if(storage.store[e] > 600000){
                        switch(level){
                            case 4 : 
                                Memory.rooms[roomName]['creeps']['work_up']['num'] = 4;
                                break
                            case 5 : 
                                Memory.rooms[roomName]['creeps']['work_up']['num'] = 3;
                                break
                            case 6 : 
                                Memory.rooms[roomName]['creeps']['work_up']['num'] = 2;
                                break
                        }
                    }
                }else if(storage.store[e] < 100000){
                    Memory.rooms[roomName]['creeps']['work_up']['num'] = 1
                }
            }
            f_spawning = creepCenter(room, roomName)
        }
        //中心
        //50tick检测重建
        if (state == 'd' || Game.time % 50 == 0) cachebuild(roomName)
        var stage = Memory.rooms[roomName]['begin_stage']
        //清理死爬名字
        if(Game.time % 10 == 0){
            for(var i in Memory.rooms[roomName]['creeps']){
                if(i.split('_').length == 2){
                    for(var j = 0;j < Memory.rooms[roomName]['creeps'][i]['name'].length;j++){
                        var creepName = Memory.rooms[roomName]['creeps'][i]['name'][j]
                        var creep = Game.creeps[creepName]
                        if(!creep){
                            Memory.rooms[roomName]['creeps'][i]['name'].splice(j,1);
                        }
                    }
                }else{
                    if(Memory.rooms[roomName]['creeps'][i]['name']){
                        var creep = Game.creeps[Memory.rooms[roomName]['creeps'][i]['name']]
                        if(!creep)Memory.rooms[roomName]['creeps'][i]['name'] = null;
                    }
                }
            }
        }
        //挖矿机
        if (level >= 6 && !Memory.rooms[roomName]['mineral']['build'] && Game.time % 10 == 0) {
            var mineral = Game.getObjectById(Memory.rooms[roomName]['mineral']['id'])
            var build = mineral.pos.lookFor(LOOK_STRUCTURES)[0]
            if (build) Memory.rooms[roomName]['mineral']['build'] = true
        }
        //中心能量容器
        if (Memory.rooms[roomName]['energyContainer']) {
            if (!Memory.rooms[roomName]['energyContainer'][0]['id']) {
                var container0 = s_p(Memory.rooms[roomName]['energyContainer'][0]['pos'], roomName).lookFor(LOOK_STRUCTURES)[0]
                if (container0) Memory.rooms[roomName]['energyContainer'][0]['id'] = container0.id
            }
            if (!Memory.rooms[roomName]['energyContainer'][1]['id']) {
                var container1 = s_p(Memory.rooms[roomName]['energyContainer'][1]['pos'], roomName).lookFor(LOOK_STRUCTURES)[0]
                if (container1) Memory.rooms[roomName]['energyContainer'][1]['id'] = container1.id
            }
        }
        //外矿link
        if(level == 8){
            if(!Memory.rooms[roomName]['outLink']){
                Memory.rooms[roomName]['outLink'] = {};
                Memory.rooms[roomName]['outLink']['num'] = 2;
            }
        }
        //爬爬
        switch (stage) {
            case 1:
                var type = roomName + '/home/source'
                var creepName = randomName();
                var body = creepbody([WORK, WORK, MOVE], [WORK, CARRY, MOVE], room, 18)
                var f = spawn.spawnCreep(body, creepName,{memory:{workType : type}})
                if (f == OK) {
                    Memory.rooms[roomName]['creeps']['work_source']['name'][0] = creepName
                    Memory.rooms[roomName]['begin_stage']++;
                }
                break;
            case 2:
                var type= roomName + '/home/carry'
                var creepName = randomName();
                var body = creepbody([CARRY, MOVE], [CARRY, MOVE,CARRY, MOVE,CARRY, MOVE,CARRY, MOVE,CARRY, MOVE,CARRY, MOVE,CARRY, MOVE,CARRY, MOVE], room, 20)
                if (spawn.spawnCreep(body, creepName,{memory:{workType : type}}) == OK){
                    Memory.rooms[roomName]['creeps']['work_carry']['name'][0] = creepName
                    Memory.rooms[roomName]['begin_stage']++;
                }
                break;
            case 3:
                var type = roomName + '/home/source'
                var creepName = randomName();
                var body = creepbody([WORK, WORK, MOVE], [WORK, CARRY, MOVE], room, 18)
                if (spawn.spawnCreep(body, creepName,{memory:{workType : type}}) == OK) {
                    Memory.rooms[roomName]['creeps']['work_source']['name'][1] = creepName
                    Memory.rooms[roomName]['begin_stage']++;
                }
                break;
            case 4:
                //产搬运爬
                if(!f_spawning && Memory.rooms[roomName]['creeps']['work_carry']['name'].length < Memory.rooms[roomName]['creeps']['work_carry']['num']){
                    var creepName = randomName()
                    var body
                    if (level <= 2) {
                        if (room.energyAvailable < 300) body = [CARRY, CARRY, MOVE, MOVE]
                        else body = creepbody([CARRY, MOVE], [CARRY, MOVE], room, 10)
                    } else if (level <= 4) {
                        if (room.energyAvailable < 750) body = [CARRY, CARRY, MOVE]
                        else body = creepbody([CARRY, CARRY, MOVE], [CARRY, CARRY, MOVE], room, 15)
                    } else {
                        if (room.energyAvailable < 1500) body = [CARRY, CARRY, MOVE]
                        else body = creepbody([CARRY, CARRY, MOVE], [CARRY, CARRY, MOVE], room, 30)
                    }
                    
                    var type = roomName + '/home/carry'
                    var spawn_f = spawn.spawnCreep(body, creepName,{memory:{workType : type}})
                    if (spawn_f == OK){
                        f_spawning = true
                        for(var i = 0;i <Memory.rooms[roomName]['creeps']['work_carry']['num'];i++){
                            if(!Memory.rooms[roomName]['creeps']['work_carry']['name'][i]){
                                Memory.rooms[roomName]['creeps']['work_carry']['name'][i] = creepName
                                break;
                            }
                        }
                    } 
                    break
                }
                //挖能量爬
                if(!f_spawning && Memory.rooms[roomName]['creeps']['work_source']['name'].length < Memory.rooms[roomName]['creeps']['work_source']['num']){
                    var creepName = randomName()
                    var body
                    if (level == 1) {
                        body = [WORK, WORK, MOVE]
                    } else {
                        if (room.energyAvailable <= 300 && !sifu) body = [WORK, WORK, CARRY, MOVE]
                        else {
                            if(level == 8)body = creepbody([CARRY], [WORK, WORK, MOVE], room, 22)
                            else body = creepbody([CARRY], [WORK, WORK, MOVE], room, 16)
                        }
                    }
                    var type = roomName + '/home/source'
                    var spawn_f = spawn.spawnCreep(body, creepName,{memory:{workType : type,no_pull : true,no_move : false}})
                    if (spawn_f == OK){
                        f_spawning = true
                        for(var i = 0;i <Memory.rooms[roomName]['creeps']['work_source']['num'];i++){
                            if(!Memory.rooms[roomName]['creeps']['work_source']['name'][i]){
                                Memory.rooms[roomName]['creeps']['work_source']['name'][i] = creepName
                                break;
                            }
                        }
                    } 
                    break
                }
                //主防爬
                if(!f_spawning && Memory.rooms[roomName]['creeps']['work_defend']['name'].length < Memory.rooms[roomName]['creeps']['work_defend']['num']){
                    console.log(roomName,'出主防了')
                }
                //升级爬
                if(!f_spawning && Memory.rooms[roomName]['creeps']['work_up']['name'].length < Memory.rooms[roomName]['creeps']['work_up']['num']){
                    var creepName = randomName()
                    var body
                    if (!Memory.rooms[roomName]['oneWorkCreepUp']) {
                        var level = level
                        switch (true) {
                            case (level == 1):
                                body = [WORK, MOVE, CARRY, MOVE]
                                break
                            case (level == 2):
                                if (room.energyAvailable < 550) body = [WORK, CARRY, MOVE, MOVE]
                                else body = [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE]
                                break
                            case (level == 8):
                                body = [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
                                break
                            case (level > 2):
                                body = creepbody([WORK, CARRY, MOVE], [WORK, CARRY, MOVE], room, 50)
                                break
                        }
                    } else body = [WORK, CARRY, MOVE]
                    var type = roomName + '/home/up'
                    var spawn_f = spawn.spawnCreep(body, creepName,{memory:{workType : type}})
                    if (spawn_f == OK){
                        f_spawning = true
                        for(var i = 0;i <Memory.rooms[roomName]['creeps']['work_up']['num'];i++){
                            if(!Memory.rooms[roomName]['creeps']['work_up']['name'][i]){
                                Memory.rooms[roomName]['creeps']['work_up']['name'][i] = creepName
                                break;
                            }
                        }
                    } 
                    break
                }
                //外矿爬
                if (!Memory.rooms[roomName]['out_energy_ob']) {
                    var creepName = roomName + '/out/0'
                    var creep = Game.creeps[creepName]
                    if (!creep) {
                        if (spawn.spawnCreep([MOVE], creepName) == OK) f_spawning = true;
                    }
                } else if(state == 's'){
                    for (var outName in Memory.rooms[roomName]['out_energy']) {
                        if (f_spawning) break;
                        if (Memory.rooms[roomName]['out_energy'][outName]['state'] == 'd') {
                            creepName = roomName + '/outEnergy/dfer/' + outName
                            creep = Game.creeps[roomName]
                            if (!creep) {
                                var body
                                if (level == 1) body = [ATTACK, MOVE]
                                else if (level == 2) body = creepbody([ATTACK, MOVE], [ATTACK, MOVE], room, 8)
                                else if (room.energyCapacityAvailable < 1300) body = creepbody([HEAL,MOVE,ATTACK, MOVE], [ATTACK, MOVE], room, 20)
                                else body = creepbody([HEAL, HEAL, MOVE, MOVE], [ATTACK, MOVE], room, 50)
                                if (spawn.spawnCreep(body, creepName, { memory: { heal: true } }) == OK) f_spawning = true
                            }
                        }else{
                            if (f_spawning) break;
                            for (var i in Memory.rooms[roomName]['out_energy'][outName]['energy']) {
                                if (!Memory.rooms[roomName]['out_energy'][outName]['energy'][i]['id']) continue
                                if (f_spawning) break;
                                var creepName = roomName + '/outEnergy/harvester/' + outName + '/' + i
                                var creep = Game.creeps[creepName]
                                if (!creep) {
                                    var body = creepbody([CARRY, WORK, WORK, MOVE], [WORK, WORK, MOVE], room, 16)
                                    if (spawn.spawnCreep(body, creepName, { memory: { no_pull: true } }) == OK) f_spawning = true
                                }
                                if (f_spawning) break;
                                if (Memory.rooms[roomName]['out_energy'][outName]['energy'][i]['container']) {
                                    creepName = roomName + '/outEnergy/carryer/' + outName + '/' + i
                                    creep = Game.creeps[roomName]
                                    if (!creep) {
                                        var body
                                        if (level <= 3  || (level == 4 && room.energyCapacityAvailable < 1300) || !storage) body = creepbody([CARRY, MOVE], [CARRY, MOVE], room, 16)
                                        else{
                                            if(!Memory.rooms[roomName]['out_energy'][outName]['energy'][i]['big'])body = creepbody([WORK, WORK, MOVE], [CARRY, CARRY, MOVE], room, 30)
                                            else body = creepbody([WORK, WORK,CARRY,MOVE, MOVE], [CARRY, CARRY, MOVE], room, 50)
                                        }
                                        if (spawn.spawnCreep(body, creepName) == OK) f_spawning = true
                                    }
                                }
                            }
                            if (f_spawning) break;
                            if (level >= 4) {
                                creepName = roomName + '/outEnergy/claimer/' + outName
                                creep = Game.creeps[creepName]
                                if (!creep) {
                                    var body
                                    if(room.energyCapacityAvailable < 1300 && room.energyCapacityAvailable > 650 && (Game.rooms[outName] && Game.rooms[outName].reservation && Game.rooms[outName].reservation.username != Memory.playerName))body = [CLAIM,MOVE]
                                    else {
                                        var cr = Game.rooms[outName]
                                        if(cr){
                                            var c = cr.controller
                                            if(c && (!c.reservation || c.reservation.username == Memory.playerName))body = creepbody([CLAIM, CLAIM], [MOVE], room, 7)
                                            else if(c && c.reservation && c.reservation.username != Memory.playerName && c.reservation.ticksToEnd > 1000)body = creepbody([CLAIM, MOVE], [CLAIM,MOVE], room, 10)
                                        }else body = creepbody([CLAIM, CLAIM], [MOVE], room, 7)
                                    }
                                    if (spawn.spawnCreep(body, creepName) == OK) f_spawning = true
                                }
                            }
                        }
                    }
                }
                //建造爬
                if(Memory.rooms[roomName]['building'] && !f_spawning && Memory.rooms[roomName]['creeps']['work_build']['name'].length < Memory.rooms[roomName]['creeps']['work_build']['num']){
                    var creepName = randomName()
                    var body
                    if (level < 3) {
                        body = creepbody([WORK, MOVE, MOVE, CARRY], [WORK, MOVE], room, 10)
                    } else {
                        body = creepbody([WORK, CARRY, MOVE], [WORK, CARRY, MOVE], room, 50)
                    }
                    var type = roomName + '/home/build'
                    var spawn_f = spawn.spawnCreep(body, creepName,{memory:{workType : type}})
                    if (spawn_f == OK){
                        f_spawning = true
                        for(var i = 0;i <Memory.rooms[roomName]['creeps']['work_build']['num'];i++){
                            if(!Memory.rooms[roomName]['creeps']['work_build']['name'][i]){
                                Memory.rooms[roomName]['creeps']['work_build']['name'][i] = creepName
                                break;
                            }
                        }
                    } 
                    break
                }
                //刷墙爬
                if(!f_spawning && Memory.rooms[roomName]['creeps']['work_wall']['name'].length < Memory.rooms[roomName]['creeps']['work_wall']['num'] && storage && (storage.store[e] > 10000 || Memory.rooms[roomName]['state'] == 'd')){
                    var creepName = randomName()
                    var body
                    if(level < 7)body = creepbody([WORK, CARRY, MOVE], [WORK,CARRY, MOVE], room, 50)
                    else body = [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE]
                    var type = roomName + '/home/wall'
                    var spawn_f = spawn.spawnCreep(body, creepName,{memory:{workType : type}})
                    if (spawn_f == OK){
                        f_spawning = true
                        for(var i = 0;i <Memory.rooms[roomName]['creeps']['work_wall']['num'];i++){
                            if(!Memory.rooms[roomName]['creeps']['work_wall']['name'][i]){
                                Memory.rooms[roomName]['creeps']['work_wall']['name'][i] = creepName
                                break;
                            }
                        }
                    } 
                    break
                }
                //挖矿爬
                if (state == 's' && Memory.rooms[roomName]['mineral']['build'] && !f_spawning && storage) {
                    if (Memory.rooms[roomName]['mineral']['tick'] <= Game.time) {
                        if(!Memory.rooms[roomName]['creeps']['miner']['name']){
                            var type = roomName + '/home/miner'
                            var creepName = randomName()
                            var body = creepbody([CARRY, MOVE, WORK], [CARRY, MOVE, WORK], room, 50)
                            if (spawn.spawnCreep(body, creepName,{memory:{workType : type}}) == OK){
                                f_spawning = true
                                Memory.rooms[roomName]['creeps']['miner']['name'] = creepName
                            } 
                        }
                    }
                }
                //mask
                if(!Memory.rooms[roomName]['mask']){
                    if(!Memory.rooms[roomName]['maskCreep'])Memory.rooms[roomName]['maskCreep'] = randomName()
                    var creep = Game.creeps[Memory.rooms[roomName]['maskCreep']]
                    if(!f_spawning){
                        if(!creep){
                            spawn.spawnCreep([MOVE],Memory.rooms[roomName]['maskCreep'])
                        }
                    }
                    if(creep && !creep.spawning){
                        creep.say('\\大猫猫/',true)
                        var controller = room.controller
                        if(creep.maskController(controller)){
                            Memory.rooms[roomName]['mask'] = true
                            delete Memory.rooms[roomName]['maskCreep']
                            creep.suicide()
                        }
                    }
                }
                break;
        }
        //房间任务爬
        if(!f_spawning && Memory.rooms[roomName]['outCreeps']){
            for(var i in Memory.rooms[roomName]['outCreeps']){
                if(f_spawning)break;
                if(more1.indexOf(i) == -1){
                    for(var j in Memory.rooms[roomName]['outCreeps'][i]){
                        if(f_spawning)break;
                        var creepName = j
                        var type = Memory.rooms[roomName]['outCreeps'][i][j]
                        var creep = Game.creeps[creepName]
                        if(!creep){
                            var creepConfig = outCreepBodyConfig[i]
                            var body = creepbody(creepConfig[0],creepConfig[1], room, creepConfig[2])
                            var spawn_f = spawn.spawnCreep(body,creepName,{memory:{workType:type}})
                            if(spawn_f == OK){
                                f_spawning = true
                            }
                        }
                    }
                }else{
                    for(var j in Memory.rooms[roomName]['outCreeps'][i]){
                        if(f_spawning)break;
                        for(var k in Memory.rooms[roomName]['outCreeps'][i][j]){
                            if(f_spawning)break;
                            var creepName = k
                            var type = Memory.rooms[roomName]['outCreeps'][i][j][k]
                            var creep = Game.creeps[creepName]
                            if(!creep){
                                var creepConfig = outCreepBodyConfig[i][j]
                                var body = creepbody(creepConfig[0],creepConfig[1], room, creepConfig[2])
                                var spawn_f = spawn.spawnCreep(body,creepName,{memory:{workType:type}})
                                if(spawn_f == OK){
                                    f_spawning = true
                                }
                            }
                        }
                    }
                }
            }
        }
        Memory.rooms[roomName]['aisle_task'] = {}
        //过道任务爬
        if(!f_spawning && Object.keys(Memory.rooms[roomName]['aisle_task']).length > 0){
            // console.log('test_aisle_task')
            var task = Memory.rooms[roomName]['aisle_task']
            for(var outName in task){
                let type = task[outName]['type']
                if(!task[outName]['creeps'])Memory.rooms[roomName]['aisle_task'][outName]['creeps'] = {}
                if(type == 'power'){
                    if(!Memory.rooms[roomName]['aisle_task'][outName]['creeps']['power']){
                        Memory.rooms[roomName]['aisle_task'][outName]['creeps']['power'] = {}
                        Memory.rooms[roomName]['aisle_task'][outName]['creeps']['power']['heal'] = {}
                        Memory.rooms[roomName]['aisle_task'][outName]['creeps']['power']['heal'][randomName()] = roomName + '/aisle/power/heal/' + outName
                        Memory.rooms[roomName]['aisle_task'][outName]['creeps']['power']['attack'] = {}
                        Memory.rooms[roomName]['aisle_task'][outName]['creeps']['power']['attack'][randomName()] = roomName + '/aisle/power/attack/'+outName
                    }
                    var power_ = Memory.rooms[roomName]['aisle_task'][outName]['creeps']['power']
                    for(var creepType in power_){
                        var creepName = Object.keys(power_[creepType])[0]
                        var creep = Game.creeps[creepName]
                        var workType_ = power_[creepType][creepName]
                        var creepConfig = outCreepBodyConfig['power'][creepType]
                        var body = creepbody(creepConfig[0],creepConfig[1], room, creepConfig[2])
                        if(!creep){
                            spawn.spawnCreep(body,creepName,{memory:{workType : workType_}})
                            f_spawning = true;
                            break
                        }
                    }
                    if(f_spawning)break
                }else{
                    
                }
            }
        }
        
        if(showAllRoomBool){
            var str_storage = '',str_terminal = '',str_lab = '  [lab无任务]',str_factory = ' [工厂无任务]'
            if(storage){
                str_storage = ' [仓库:' + ((storage.store.getUsedCapacity() * 100) / storage.store.getCapacity()).toFixed(2) + ' %] '
            }
            if(terminal){
                str_terminal = ' [终端:' + ((terminal.store.getUsedCapacity() * 100) / terminal.store.getCapacity()).toFixed(2) + ' %] '
            }
            if(factory){
                let from_type = Memory.rooms[roomName]['factory']['from_type']
                let to_type = Memory.rooms[roomName]['factory']['to_type']
                if(from_type && to_type) str_factory = ' [工厂任务:' + from_type + ' => ' +  to_type + ']'
            }
            if(Memory.rooms[roomName]['lab']['labs'].length < 3)str_lab = ' 无 lab 缓存'
            var type = Memory.rooms[roomName]['lab']['task']['type']
            if(type)str_lab = '  [lab任务:合成 '+Memory.rooms[roomName]['lab']['task']['amount'] + ' ' +type + ']'
            var str_outEnergyCount = ' [外矿]数量: ' + Object.keys(Memory.rooms[roomName]['out_energy']).length
            var str_cpu = '[CPU:' + (Game.cpu.getUsed() - roomCpu).toFixed(2) + ']'
            if(level < 8)str = '[能量]:'+room.energyAvailable+'/'+room.energyCapacityAvailable+'[房间等级]:'+level+' [控制器进度]:'+ ((controller.progress * 100) / controller.progressTotal).toFixed(2)+' % '
            else str = '[能量]:'+room.energyAvailable+'/'+room.energyCapacityAvailable+'[房间已8级]'
            jumpToRoom(roomName,0,str + str_storage + str_terminal + str_outEnergyCount + str_lab + str_factory + str_cpu);
        }
    }
    if(showAllRoomBool)showAllRoomBool = false
}
function findAisle(roomName){
    let s1 = getIntArr(roomName.slice(0,3))
    let s2 = getIntArr(roomName.slice(3,6))
    let z1 = roomName[0]
    let z2 = getStrArr(roomName.slice(2,4))
    var o1 = Math.floor(parseInt(s1) / 10)
    var o2 = Math.floor(parseInt(s2) / 10)
    var oRoomNames = []
    for(var i = 0;i <= 10;i++){
        let oRoomName1 = z1 + (o1 + i) + z2 + o2
        oRoomNames.push(oRoomName1)
        let oRoomName2 = z1 + (o1 + i) + z2 + (o2 + 10)
        oRoomNames.push(oRoomName2)
    }
    for(var i = 0;i <= 10;i++){
        let oRoomName1 = z1 + o1 + z2 + (o2 + i)
        oRoomNames.push(oRoomName1)
        let oRoomName2 = z1 + (o1 + 10) + z2 + (o2 + i)
        oRoomNames.push(oRoomName2)
    }
    var outNames = []
    for(var outName of oRoomNames){
        if(Game.map.getRoomLinearDistance(outName,roomName) < 2)outNames.push(outName)
    }
    Memory.rooms[roomName]['aisle']['outName'] = outNames
    Memory.rooms[roomName]['aisle']['findfind'] = true
}
function dealAisle(){
    // return
    for(var outName in Memory.aisle){
        var all = Memory.aisle[outName]
        if(all['receive']){
            continue
        }
        if(all['tick'] && all['tick'] <= Game.time){
            delete Memory.aisle[outName]
            console.log('过道任务:',outName,'挖',all['type'],'已过期')
        }
        // 可接受任务房间
        var room_ = []
        for(let roomName in Memory.rooms){
            if(!Memory.rooms[roomName]['aisle_task'])Memory.rooms[roomName]['aisle_task'] = {}
            if(Object.keys(Memory.rooms[roomName]['aisle_task']).length >= 2 || !Memory.rooms[roomName]['aisle']['open'])continue
            var length = Game.map.getRoomLinearDistance(outName,roomName)
            if(length < 8){
                room = {roomName:roomName,length:length}
                room_.push(room)
            }
        }
        // console.log(outName,'[',Memory.aisle[outName]['type'],']:')
        for(var r in room_){
            console.log(room_[r].roomName,room_[r].length)
        }
        if(room_.length == 0)continue
        if(room_.length == 1)addAisleTask(room_[0].roomName,outName)
        else{
            let room = room_.sort((a,b) => (a.length - b.length))[0]
            addAisleTask(room.roomName,outName)
        }
    }
}
function addAisleTask(roomName,outName){
    Memory.rooms[roomName]['aisle_task'][outName] = {}
    Memory.rooms[roomName]['aisle_task'][outName] = Memory.aisle[outName]
    Memory.aisle[outName]['receive'] = roomName
    jumpToRoom(outName,roomName + '接收过道任务:',0)
}
//提取数字
function getIntArr(str){
    return str.replace(/[^0-9]/ig,'')
}
//提取字母
function getStrArr(str){
    return str.replace(/[^A-Z]/ig,'')
}
const outType = ['claim','help','ATK']
function dealFlag(){
    //处理存在的旗子
    for (var flagName in Game.flags) {
        var flag = Game.flags[flagName]
        var roomName = flag.pos.roomName
        var type = flagName.split('/')
        if (flagName == 'addRoom') addRoom(flag)
        else if (flagName == 'deleteRoom') deleteRoom(flag)
        else if (flagName == 'visual') visualRoom(roomName);
        else if (type[0] == 'deleteRoomBuild') deleteRoomBuild(flag, type[1])
        else if (outType.indexOf(type[1]) != -1) createName(flag,type)
    }
    //每500tick检测内存旗子
    if(Game.time % 500)return
    for(var flagName in Memory.flags){
        if(!Game.flags[flagName]) delete Memory.flags[flagName]
    }
}

function dealCreep(){
    var beginCpu = Game.cpu.getUsed();
    var b,tc = 0;
    if(showAllCreepUsedCpuBool)var creepData = [],cpu0 = 0,cpu1 = 0,cpu2 = 0,cpu3 = 0
    for (var creepName in Game.creeps) {
        var creep = Game.creeps[creepName]
        if(creep.spawning)continue
        if(showAllCreepUsedCpuBool)b = Game.cpu.getUsed();
        var workType = creep.memory.workType
        if (!workType){
            var type = creepName.split('/')[1]
            if(type){
                switch (type) {
                    case 'out':
                        creepOutInit(creep)
                        break
                    case 'outEnergy':
                        creepOutEnergy(creep)
                        break
                }
                // if(v)console.log(creepName,'[工作]:',type,'[CPU]:',Game.cpu.getUsed() - b)
            }
        }else{
            var type = workType.split('/')[1]
            if(type){
                switch (type) {
                    case 'home':
                        creepHome(creep,workType);
                        break
                    case 'out':
                        tc++;
                        creepOut(creep,workType,showAllCreepTaskBool);
                        break
                    case 'aisle':
                        tc++;
                        creepAisle(creep,workType,showAllCreepTaskBool);
                        break
                }
            }
        }
        creep.chat()    
        if(showAllCreepUsedCpuBool){
            var cpuUsed = (Game.cpu.getUsed() - b).toFixed(4)
            if(cpuUsed < 0.1)cpu0++
            else if(cpuUsed < 0.4)cpu1++
            else if(cpuUsed < 1)cpu2++
            else cpu3++
            var str_creep = '[爬爬名字:'  + creepName + '[CPU]:' + cpuUsed + '] '
            creepData[creepData.length] = str_creep
            if(creepData.length == 3){
                console.log(creepData)
                creepData = []
            }
        }
    }
    if(showAllCreepUsedCpuBool){
        console.log('[空闲爬爬:',cpu0,'][正常爬爬:',cpu1,'][有点忙爬爬:',cpu2,'][很急的爬爬:',cpu3,'][总爬数:',creepCount,']')
        showAllCreepUsedCpuBool = false
    }
    if(showAllCreepTaskBool){
        if(tc == 0)console.log('当前无任务,或者任务爬正在孵化...')
        else console.log('任务数量:',tc)
        showAllCreepTaskBool = false
    }
    var useCpu = Game.cpu.getUsed() - beginCpu;
    return useCpu
}
//添加房间
function addRoom(flag) {
    var roomName = flag.pos.roomName;
    var room = flag.room
    if (!room) {
        console.log('房间', roomName, '无视野')
        return flag.remove();
    }
    if (Memory.rooms[roomName]) return flag.remove();
    else Memory.rooms[roomName] = {}
    // Memory.rooms[roomName] = {}
    var controller = room.controller

    Memory.rooms[roomName]['state'] = 's'
    Memory.rooms[roomName]['begin_stage'] = 1
    Memory.rooms[roomName]['level'] = controller.level
    //矿
    var mineral = room.find(FIND_MINERALS)[0]
    Memory.rooms[roomName]['mineral'] = {}
    Memory.rooms[roomName]['mineral']['type'] = mineral.mineralType
    Memory.rooms[roomName]['mineral']['id'] = mineral.id
    Memory.rooms[roomName]['mineral']['build'] = false
    Memory.rooms[roomName]['mineral']['tick'] = 0
    //房间废墟
    Memory.rooms[roomName]['ruin'] = room.find(FIND_RUINS, { filter: r => r.store.getUsedCapacity() > 0 }).length > 0   //有东西的废墟
    Memory.rooms[roomName]['ruin_energy'] = room.find(FIND_RUINS, { filter: r => r.store[e] > 0 }).length > 0           //有能量的废墟
    //房间内是否有工地
    Memory.rooms[roomName]['building'] = false;
    //需要维护的建筑
    Memory.rooms[roomName]['repair'] = {};
    //维护的炮台
    Memory.rooms[roomName]['repairTower'] = null;
    //房间内置爬爬
    Memory.rooms[roomName]['creeps'] = {};
    //房间外置爬爬
    Memory.rooms[roomName]['outCreeps'] = {}
    //挖能量爬
    Memory.rooms[roomName]['creeps']['work_source'] = {}
    Memory.rooms[roomName]['creeps']['work_source']['num'] = 0
    Memory.rooms[roomName]['creeps']['work_source']['name'] = [];
    //升级爬
    Memory.rooms[roomName]['creeps']['work_up'] = {}
    Memory.rooms[roomName]['creeps']['work_up']['num'] = 5
    Memory.rooms[roomName]['creeps']['work_up']['name'] = []
    //建造爬
    Memory.rooms[roomName]['creeps']['work_build'] = {}
    Memory.rooms[roomName]['creeps']['work_build']['num'] = 4
    Memory.rooms[roomName]['creeps']['work_build']['name'] = []
    //搬运爬
    Memory.rooms[roomName]['creeps']['work_carry'] = {}
    Memory.rooms[roomName]['creeps']['work_carry']['num'] = 4
    Memory.rooms[roomName]['creeps']['work_carry']['name'] = []
    //刷墙爬
    Memory.rooms[roomName]['creeps']['work_wall'] = {}
    Memory.rooms[roomName]['creeps']['work_wall']['num'] = 0;
    Memory.rooms[roomName]['creeps']['work_wall']['name'] = [];
    //维护爬
    Memory.rooms[roomName]['creeps']['work_repair'] = {}
    Memory.rooms[roomName]['creeps']['work_repair']['num'] = 1;
    Memory.rooms[roomName]['creeps']['work_repair']['name'] = [];
    //主防爬
    Memory.rooms[roomName]['creeps']['work_defend'] = {}
    Memory.rooms[roomName]['creeps']['work_defend']['num'] = 0;
    Memory.rooms[roomName]['creeps']['work_defend']['name'] = [];
    //挖矿爬
    Memory.rooms[roomName]['creeps']['miner'] = {}
    Memory.rooms[roomName]['creeps']['miner']['name'] = null;
    //房间内能量矿信息
    Memory.rooms[roomName]['sources'] = {}
    //lab配置
    Memory.rooms[roomName]['lab'] = {};
    Memory.rooms[roomName]['lab']['state'] = 'finish'
    Memory.rooms[roomName]['lab']['labs'] = {};
    Memory.rooms[roomName]['lab']['task'] = {};
    //终端订单
    Memory.rooms[roomName]['terminal'] = {};
    Memory.rooms[roomName]['terminal']['buy'] = {};
    Memory.rooms[roomName]['terminal']['sell'] = {};
    //工厂任务
    Memory.rooms[roomName]['factory'] = {};
    Memory.rooms[roomName]['factory']['id'] = null;
    Memory.rooms[roomName]['factory']['on-off'] = false;
    Memory.rooms[roomName]['factory']['from_type'] = null;
    Memory.rooms[roomName]['factory']['from_amount'] = 0;
    Memory.rooms[roomName]['factory']['to_type'] = null;
    Memory.rooms[roomName]['factory']['fill'] = false
    Memory.rooms[roomName]['factory']['finish'] = false
    Memory.rooms[roomName]['factory']['cd'] = 0;
    //外矿信息
    Memory.rooms[roomName]['out_energy'] = {};
    Memory.rooms[roomName]['out_energy_ob'] = false;
    //过道信息
    Memory.rooms[roomName]['aisle'] = {};
    //建筑缓存
    Memory.rooms[roomName]['build'] = {};
    Memory.rooms[roomName]['build']['road/s'] = {}
    Memory.rooms[roomName]['build']['spawn/s'] = {}
    Memory.rooms[roomName]['build']['extension/s'] = {}
    Memory.rooms[roomName]['build']['tower/s'] = {}
    Memory.rooms[roomName]['build']['wall/s'] = {}
    Memory.rooms[roomName]['build']['rampart/s'] = {}
    Memory.rooms[roomName]['build']['container/s'] = {}
    Memory.rooms[roomName]['build']['link/s'] = {}
    Memory.rooms[roomName]['build']['lab/s'] = {}
    Memory.rooms[roomName]['build']['storage'] = null
    Memory.rooms[roomName]['build']['extractor'] = null
    Memory.rooms[roomName]['build']['terminal'] = null
    Memory.rooms[roomName]['build']['factory'] = null
    Memory.rooms[roomName]['build']['observer'] = null
    Memory.rooms[roomName]['build']['powerSpawn'] = null
    Memory.rooms[roomName]['build']['nuker'] = null
    Memory.rooms[roomName]['build']['spawn/s'][0] = flag.pos.x + '/' + (flag.pos.y - 2)
    Memory.rooms[roomName]['openPowerSpawnWork'] = false
    Memory.rooms[roomName]['mask'] = false;
    //外矿
    outRoom(roomName)
    //地形
    const terrain = new Room.Terrain(roomName)
    var f = xy_p(flag.pos.x, flag.pos.y - 2, roomName)
    if (!f.lookFor(LOOK_STRUCTURES, { filter: s => s.structureType == STRUCTURE_SPAWN })[0] && !f.lookFor(LOOK_CONSTRUCTION_SITES, { filter: s => s.structureType == STRUCTURE_SPAWN })[0]) return console.log(flag.name, '旗子位置错误')
    console.log(Game.shard.name,'使用大猫布局,添加新房间:',roomName)
    //每级建筑缓存
    Memory.rooms[roomName]['build_BigCat'] = {}
    for (var i = 1; i <= 8; i++) {
        Memory.rooms[roomName]['build_BigCat'][i] = {};
        Memory.rooms[roomName]['build_BigCat'][i]['extension/s'] = {}
        Memory.rooms[roomName]['build_BigCat'][i]['road/s'] = {}
        if (i >= 6) Memory.rooms[roomName]['build_BigCat'][i]['lab/s'] = {}
    }
    Memory.rooms[roomName]['build_BigCat'][6]['rampart/s'] = {}
    Memory.rooms[roomName]['build_BigCat'][7]['rampart/s'] = {}
    Memory.rooms[roomName]['build_BigCat'][8]['rampart/s'] = {}
    Memory.rooms[roomName]['build_BigCat'][6]['extractor'] = p_s(mineral.pos)
    var costs = new PathFinder.CostMatrix;
    var visual = new RoomVisual(roomName)
    for (var x = 0; x < 50; x++) {
        for (var y = 0; y < 50; y++) {
            if (terrain.get(x, y) == 1 || xy_xy(x, y, 0) || xy_xy(x, y, 1)) costs.set(x, y, 255)
        }
    }

    var r = 0, center_x = flag.pos.x, center_y = flag.pos.y;
    //中心(旗子)
    Memory.rooms[roomName]['center'] = p_s(flag.pos)
    r = BGL(roomName, r, center_x, center_y,terrain)
    if (r == -1) {
        console.log('布局失败')
        delete Memory.rooms[roomName]
        return flag.remove();
    }
    costs = BGC(roomName, costs)
    //能量信息
    var source_i = 0, source_creep = 0, container_i = 0, link_i = 0, link_max = null, source_extension_pos = [], extension_4 = 4; extension_5 = 10, source_path = [], container_p = [];
    room.find(FIND_SOURCES).forEach(source => {
        Memory.rooms[roomName]['sources'][source_i] = {}
        Memory.rooms[roomName]['sources'][source_i]['id'] = source.id
        var sc = 0, container_pos = 0, link_f = true;
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
            for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
                if (y == source.pos.y && x == source.pos.x) continue
                const tile = terrain.get(x, y);
                if (tile == TERRAIN_MASK_WALL || xy_xy(x, y, 2)) continue
                sc++;
                var k = 0;
                if (container_pos == 0) {
                    cx = x
                    cy = y;
                    container_pos = x + '/' + y
                    for (let ky = y - 1; ky <= y + 1; ky++) {
                        for (let kx = x - 1; kx <= x + 1; kx++) {
                            if (ky == y && kx == x) continue
                            const ktile = terrain.get(kx, ky);
                            if (ktile != TERRAIN_MASK_WALL) k++
                        }
                    }
                    sk = k;
                } else {
                    for (let ky = y - 1; ky <= y + 1; ky++) {
                        for (let kx = x - 1; kx <= x + 1; kx++) {
                            if (ky == y && kx == x) continue
                            const ktile = terrain.get(kx, ky);
                            if (ktile != TERRAIN_MASK_WALL) k++
                        }
                    }
                    if (k > sk) {
                        cx = x
                        cy = y;
                        sk = k;
                        container_pos = x + '/' + y
                    }
                }
            }
        }
        Memory.rooms[roomName]['build_BigCat'][2]['container/s'][container_i] = container_pos
        container_p[container_i] = container_pos
        var container_s = container_pos
        container_pos = s_p(container_pos, roomName)
        var flag_container_pack = BG_path(flag.pos, container_pos, 1, costs)
        costs = flag_container_pack.costs
        source_path[container_i] = flag_container_pack.path
        if (BG_path_length(flag.pos, container_pos, 1) < 6) link_f = false;
        for (var pos of source_path[container_i]) {
            if (Math.abs(pos.x - flag.pos.x) < 3 && Math.abs(pos.y - flag.pos.y) <= 3) continue
            if (sp_distance(container_s, pos) > 1) continue
            costs.set(pos.x, pos.y, 1)
            Memory.rooms[roomName]['build_BigCat'][3]['road/s'][r++] = pos.x + '/' + pos.y
        }
        if (link_f) {
            var link_pos = null, link_dis = null
            for (let y = cy - 1; y <= cy + 1; y++) {
                for (let x = cx - 1; x <= cx + 1; x++) {
                    if (cy == y && cx == x) continue
                    const ltile = terrain.get(x, y);
                    if (ltile != TERRAIN_MASK_WALL && costs.get(x, y) == 0) {
                        if (!link_pos) {
                            link_pos = x + '/' + y
                            link_dis = ss_distance(link_pos, Memory.rooms[roomName]['center'])
                        } else {
                            var dis = ss_distance(x + '/' + y, Memory.rooms[roomName]['center'])
                            if (dis < link_dis) {
                                link_pos = x + '/' + y
                                link_dis = ss_distance(x + '/' + y, Memory.rooms[roomName]['center'])
                            }
                        }
                    }
                }
            }
            if (!link_max) {
                link_max = link_pos
                costs.set(link_pos.split('/')[0], link_pos.split('/')[1], 255)
                Memory.rooms[roomName]['build_BigCat'][5]['link/s'][0] = link_max
            } else {
                if (ss_distance(link_max, Memory.rooms[roomName]['center']) < ss_distance(link_pos, Memory.rooms[roomName]['center'])) {
                    Memory.rooms[roomName]['build_BigCat'][5]['link/s'][0] = link_pos
                    Memory.rooms[roomName]['build_BigCat'][6]['link'] = link_max
                } else {
                    Memory.rooms[roomName]['build_BigCat'][6]['link'] = link_pos
                }
                costs.set(link_pos.split('/')[0], link_pos.split('/')[1], 255)
            }
        }

        for (let ky = cy - 1; ky <= cy + 1; ky++) {
            for (let kx = cx - 1; kx <= cx + 1; kx++) {
                if (ky == cy && kx == cx) continue
                const ktile = terrain.get(kx, ky);
                if (ktile != TERRAIN_MASK_WALL && costs.get(kx, ky) == 0) {
                    var pos = xy_s(kx, ky)
                    if (source_extension_pos.indexOf(pos) != -1) continue
                    source_extension_pos = source_extension_pos.concat(xy_s(kx, ky))
                }
            }
        }
        if (source_extension_pos.length >= 4 && extension_4 > 0) {
            var i = 0;
            while (extension_4-- > 0) {
                var s = source_extension_pos[i]
                var pos = s_xy(s)
                Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = s
                costs.set(pos[0], pos[1], 255)
                i++;
            }
        }
        if (container_i == 1 && source_extension_pos.length > 4 && extension_5 > 0) {
            var i = 4;
            while (i < source_extension_pos.length) {
                var s = source_extension_pos[i++]
                var pos = s_xy(s)
                if (costs.get(pos[0], pos[1]) != 0) continue
                Memory.rooms[roomName]['build_BigCat'][5]['extension/s'][r++] = s
                costs.set(pos[0], pos[1], 255)
                extension_5--;
            }
        }
        if (sc > 3) {
            source_creep += 3
            Memory.rooms[roomName]['sources'][source_i]['counter'] = 3
        } else {
            source_creep += sc
            Memory.rooms[roomName]['sources'][source_i]['counter'] = sc
        }
        link_i++;
        container_i++;
        source_i++;
    })
    Memory.rooms[roomName]['creeps']['work_source']['num'] = source_creep

    if (extension_4 > 0) {
        var ex = flag.pos.x - 2, ey = flag.pos.y - 2, exm = flag.pos.x - 4, eym = flag.pos.y - 4
        while (extension_4 > 0) {
            for (var i = 0; i < 5; i++) {
                var x = ex + i;
                var y = ey + i;
                if (costs.get(x, eym) == 0) {
                    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = x + '/' + eym
                    costs.set(x, eym, 255)
                    extension_4--;
                    break;
                }
                if (costs.get(x, eym + 8) == 0) {
                    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = x + '/' + (eym + 8)
                    costs.set(x, eym + 8, 255)
                    extension_4--;
                    break;
                }
                if (costs.get(exm, y) == 0) {
                    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = exm + '/' + y
                    costs.set(exm, y, 255)
                    extension_4--;
                    break;
                }
                if (costs.get(exm + 8, y) == 0) {
                    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = (exm + 8) + '/' + y
                    costs.set(exm + 8, y, 255)
                    extension_4--;
                    break;
                }
            }
        }
    }
    //中心
    var center_s = []
    for (var x = 0; x < 50; x++) {
        for (var y = 0; y < 50; y++) {
            if (costs.get(x, y) == 255) continue
            var dis = xyp_distance(x, y, flag.pos)
            if (dis > 10) continue
            var f = true
            for (var cx = x - 2; cx <= x + 2; cx++) {
                for (var cy = y - 2; cy <= y + 2; cy++) {
                    if (cx == x - 2 && (cy == y - 2 || cy == y + 2)) continue
                    if (cx == x + 2 && (cy == y - 2 || cy == y + 2)) continue
                    let s = xy_s(cx, cy)
                    if ((cx == x - 2 || cx == x + 2 || cy == y - 2 || cy == y + 2) && costs.get(cx, cy) == 255) {
                        f = false
                        break;
                    }
                    if (costs.get(cx, cy) == 255) f = false
                }
            }
            var p = Math.abs(x - flag.pos.x) + Math.abs(y - flag.pos.y)
            if (f) center_s = center_s.concat([[xy_s(x, y), p]])
        }
    }
    Memory.rooms[roomName]['build_BigCat'][4]['road/s'] = {}
    Memory.rooms[roomName]['build_BigCat'][6]['road/s'] = {}
    center_s.sort((a, b) => (a[1] - b[1]))
    var center_S = [], w = 0;
    for (var i = 0; i < center_s.length; i++) {
        if (w == 0) {
            w = center_s[i][1]
            center_S = center_S.concat([center_s[i]])
        } else {
            if (center_s[i][1] == w) center_S = center_S.concat([center_s[i]])
            else break
        }
        if (i > 10) break;
    }
    if (center_S.length > 1) {
        for (var i = 0; i < center_S.length; i++) {
            var xy = s_xy(center_S[i][0])
            center_S[i][1] = xyp_gg(xy[0], xy[1], controller.pos)
        }
        center_S.sort((a, b) => (a[1] - b[1]))
        center_s = center_S
    } else center_s[0] = center_S[0]
    var s = center_s[0][0]
    var xy = s_xy(s), cx = xy[0], cy = xy[1], i = 0;
    Memory.rooms[roomName]['controlCenter'] = s
    for (var x = cx - 2; x <= cx + 2; x++) {
        for (var y = cy - 2; y <= cy + 2; y++) {
            if (x == cx && y == cy) {
                costs.set(x, y, 255)
                continue
            }
            if (x == cx - 2 && (y == cy - 2 || y == cy + 2)) continue
            if (x == cx + 2 && (y == cy - 2 || y == cy + 2)) continue
            let ss = xy_s(x, y)
            if ((x == cx - 2 || x == cx + 2 || y == cy - 2 || y == cy + 2) && costs.get(x, y) != 255) {
                costs.set(x, y, 1)
                Memory.rooms[roomName]['build_BigCat'][4]['road/s'][r++] = ss
            } else {
                costs.set(x, y, 255)
                switch (i) {
                    case 0:
                        Memory.rooms[roomName]['build_BigCat'][4]['storage'] = ss
                        Memory.rooms[roomName]['build_BigCat'][6]['rampart/s'][r++] = ss
                        break;
                    case 1:
                        Memory.rooms[roomName]['build_BigCat'][3]['tower'] = ss
                        Memory.rooms[roomName]['build_BigCat'][6]['rampart/s'][r++] = ss
                        break;
                    case 2:
                        Memory.rooms[roomName]['build_BigCat'][5]['link/s'][r++] = ss
                        Memory.rooms[roomName]['control_link'] = ss
                        break;
                    case 3:
                        Memory.rooms[roomName]['build_BigCat'][8]['powerSpawn'] = ss
                        Memory.rooms[roomName]['build_BigCat'][8]['rampart/s'][r++] = ss
                        break;
                    case 4:
                        Memory.rooms[roomName]['build_BigCat'][8]['spawn'] = ss
                        Memory.rooms[roomName]['build_BigCat'][8]['rampart/s'][r++] = ss
                        break;
                    case 5:
                        Memory.rooms[roomName]['build_BigCat'][6]['terminal'] = ss
                        Memory.rooms[roomName]['build_BigCat'][6]['rampart/s'][r++] = ss
                        break;
                    case 6:
                        Memory.rooms[roomName]['build_BigCat'][8]['nuker'] = ss
                        Memory.rooms[roomName]['build_BigCat'][8]['rampart/s'][r++] = ss
                        break;
                    case 7:
                        Memory.rooms[roomName]['build_BigCat'][7]['factory'] = ss
                        Memory.rooms[roomName]['build_BigCat'][8]['rampart/s'][r++] = ss
                        break;
                }
                i++;
            }
        }
    }
    var flag_center_pack = BG_path(flag.pos, s_p(s, roomName), 3, costs)
    costs = flag_center_pack.costs
    var path = flag_center_pack.path
    for (var pos of path) {
        if (Math.abs(pos.x - flag.pos.x) < 3 && Math.abs(pos.y - flag.pos.y) <= 3) continue
        costs.set(pos.x, pos.y, 1)
        Memory.rooms[roomName]['build_BigCat'][3]['road/s'][r++] = pos.x + '/' + pos.y
    }

    var lab_pack = BG_lab(roomName, costs, s_p(s, roomName))
    costs = lab_pack.costs
    var lab_s = lab_pack.lab_s
    lab_s.sort((a, b) => (a[1] - b[1]))
    for (var pos of lab_s) {
        var s = pos[0]
        var xy = s_xy(s)
        if (xy[0] - flag.pos.x >= 0) {
            if (xy[1] - flag.pos.y >= 0) {
                if (costs.get(xy[0], xy[1]) == 255 || sp_distance(s, flag.pos) <= 3 || sp_distance(s, mineral.pos) <= 5) continue
                Memory.rooms[roomName]['build_BigCat'][6]['road/s'][r++] = xy_s(xy[0], xy[1])
                Memory.rooms[roomName]['build_BigCat'][6]['road/s'][r++] = xy_s(xy[0] + 1, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][8]['road/s'][r++] = xy_s(xy[0] + 2, xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1])
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1])
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0], xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0], xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 3, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 3, xy[1] + 2)
                break
            } else {
                if (costs.get(xy[0], xy[1] + 3) == 255 || xyp_distance(xy[0], xy[1] + 3, flag.pos) <= 3 || sp_distance(s, mineral.pos) <= 5) continue
                Memory.rooms[roomName]['build_BigCat'][6]['road/s'][r++] = xy_s(xy[0], xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][6]['road/s'][r++] = xy_s(xy[0] + 1, xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][8]['road/s'][r++] = xy_s(xy[0] + 2, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0], xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0], xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1])
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1])
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 3, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 3, xy[1] + 2)
                break
            }
        } else {
            if (xy[1] - flag.pos.y >= 0) {
                if (costs.get(xy[0] + 3, xy[1]) == 255 || xyp_distance(xy[0] + 3, xy[1], flag.pos) <= 3 || sp_distance(s, mineral.pos) <= 5) continue
                Memory.rooms[roomName]['build_BigCat'][6]['road/s'][r++] = xy_s(xy[0] + 3, xy[1])
                Memory.rooms[roomName]['build_BigCat'][8]['road/s'][r++] = xy_s(xy[0] + 1, xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][6]['road/s'][r++] = xy_s(xy[0] + 2, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0], xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0], xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1])
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1])
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 3, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 3, xy[1] + 2)
                break
            } else {
                if (costs.get(xy[0] + 3, xy[1] + 3) == 255 || xyp_distance(xy[0] + 3, xy[1] + 3, flag.pos) <= 3 || sp_distance(s, mineral.pos) <= 5) continue
                Memory.rooms[roomName]['build_BigCat'][6]['road/s'][r++] = xy_s(xy[0] + 3, xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][8]['road/s'][r++] = xy_s(xy[0] + 1, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][6]['road/s'][r++] = xy_s(xy[0] + 2, xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1])
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1])
                Memory.rooms[roomName]['build_BigCat'][6]['lab/s'][r++] = xy_s(xy[0], xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0], xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1] + 2)
                Memory.rooms[roomName]['build_BigCat'][7]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 1, xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 2, xy[1] + 3)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 3, xy[1] + 1)
                Memory.rooms[roomName]['build_BigCat'][8]['lab/s'][r++] = xy_s(xy[0] + 3, xy[1] + 2)
                break
            }
        }
    }
    costs = BGC(roomName, costs)


    var extension_s = []
    for (var x = 0; x < 50; x++) {
        for (var y = 0; y < 50; y++) {
            var dis = xyp_distance(x, y, flag.pos)
            if (dis > 20) continue
            dis = xyp_distance(x, y, controller.pos)
            if (dis <= 3) continue
            if (costs.get(x, y) != 0) continue
            if (costs.get(x, y - 2) == 255 && terrain.get(x, y - 2) != 1) continue
            if (costs.get(x, y + 2) == 255 && terrain.get(x, y + 2) != 1) continue
            if (costs.get(x - 2, y) == 255 && terrain.get(x - 2, y) != 1) continue
            if (costs.get(x + 2, y) == 255 && terrain.get(x + 2, y) != 1) continue

            if (costs.get(x + 1, y - 1) == 255 && terrain.get(x + 1, y - 1) != 1) continue
            if (costs.get(x - 1, y + 1) == 255 && terrain.get(x - 1, y + 1) != 1) continue
            if (costs.get(x - 1, y - 1) == 255 && terrain.get(x - 1, y - 1) != 1) continue
            if (costs.get(x + 1, y + 1) == 255 && terrain.get(x + 1, y + 1) != 1) continue

            if (costs.get(x, y - 1) != 0) continue
            if (costs.get(x, y + 1) != 0) continue
            if (costs.get(x - 1, y) != 0) continue
            if (costs.get(x + 1, y) != 0) continue

            if (terrain.get(x + 2, y) == 1 && terrain.get(x - 2, y) == 1) continue
            if (terrain.get(x, y + 2) == 1 && terrain.get(x, y - 2) == 1) continue
            if (terrain.get(x + 1, y + 1) == 1 && terrain.get(x - 1, y + 1) == 1) continue
            if (terrain.get(x + 1, y - 1) == 1 && terrain.get(x - 1, y - 1) == 1) continue

            var g = xyp_gg(x, y, flag.pos)
            extension_s = extension_s.concat([[xy_s(x, y), g]])
        }
    }
    extension_s.sort((a, b) => (a[1] - b[1]))
    var extension_level = 6, extension_counter = 10;
    if (extension_5 > 5) {
        extension_level = 5
        extension_counter = 5
        extension_5 -= 5
    }
    while (true) {
        var s = extension_s[0][0]
        var xy = s_xy(s)
        var extensions = [s, xy_s(xy[0], xy[1] - 1), xy_s(xy[0], xy[1] + 1), xy_s(xy[0] - 1, xy[1]), xy_s(xy[0] + 1, xy[1])];
        var roads = [xy_s(xy[0] - 1, xy[1] - 1), xy_s(xy[0] - 1, xy[1] + 1), xy_s(xy[0] + 1, xy[1] - 1), xy_s(xy[0] + 1, xy[1] + 1),
        xy_s(xy[0] + 2, xy[1]), xy_s(xy[0] - 2, xy[1]), xy_s(xy[0], xy[1] - 2), xy_s(xy[0], xy[1] + 2)];
        var not_ext = [xy_s(xy[0] - 1, xy[1] + 2), xy_s(xy[0] - 1, xy[1] - 2), xy_s(xy[0] - 2, xy[1] + 1), xy_s(xy[0] - 2, xy[1] - 1),
        xy_s(xy[0] + 1, xy[1] + 2), xy_s(xy[0] + 1, xy[1] - 2), xy_s(xy[0] + 2, xy[1] + 1), xy_s(xy[0] + 2, xy[1] - 1),
        xy_s(xy[0] + 3, xy[1]), xy_s(xy[0] - 3, xy[1]), xy_s(xy[0], xy[1] + 3), xy_s(xy[0], xy[1] - 3)]
        for (var ext of extensions) {
            var ee = s_xy(ext)
            Memory.rooms[roomName]['build_BigCat'][extension_level]['extension/s'][r++] = ext
            costs.set(ee[0], ee[1], 255)
            extension_s = extension_s.filter(function (s) {
                return s[0] != ext
            })
        }
        for (var road of roads) {
            var rr = s_xy(road)
            if (costs.get(rr[0], rr[1]) == 1 || terrain.get(rr[0], rr[1]) == 1) continue
            Memory.rooms[roomName]['build_BigCat'][extension_level]['road/s'][r++] = road
            costs.set(rr[0], rr[1], 1)
            extension_s = extension_s.filter(function (s) {
                return s[0] != road
            })
        }
        for (var not of not_ext) {
            var no = s_xy(not)
            extension_s = extension_s.filter(function (s) {
                return s[0] != not
            })
        }
        extension_counter -= 5
        if (extension_counter == 0) {
            extension_counter = 10;
            extension_level++;
        }
        if (extension_level == 9) break;
    }

    var es_5 = [];
    for (var x = flag.pos.x - 10; x <= flag.pos.x + 10; x++) {
        for (var y = flag.pos.y - 10; y <= flag.pos.y + 10; y++) {
            if (costs.get(x, y) != 0) continue
            var f = false;
            for (var tx = x - 1; tx <= x + 1; tx++) {
                for (var ty = y - 1; ty <= y + 1; ty++) {
                    if (costs.get(tx, ty) == 1) f = true;
                }
            }
            if (!f) continue
            var d = xyp_distance(x, y, flag.pos)
            if (d < 3) continue
            es_5 = es_5.concat([[xy_s(x, y), d]])
        }
    }
    es_5.sort((a, b) => (a[1] - b[1]))
    for (var i = 0; i < extension_5; i++) {
        var xy = s_xy(es_5[i][0])
        Memory.rooms[roomName]['build_BigCat'][5]['extension/s'][r++] = es_5[i][0]
        costs.set(xy[0], xy[1], 255)
    }

    Memory.rooms[roomName]['build_BigCat'][8]['tower/s'] = {}
    var tower_s = [], i = 20
    for (var x = flag.pos.x - i; x <= flag.pos.x + i; x++) {
        for (var y = flag.pos.y - i; y <= flag.pos.y + i; y++) {
            if (xyp_distance(x, y, controller.pos) <= 3 || costs.get(x, y) != 0) continue
            var f = false;
            for (var tx = x - 1; tx <= x + 1; tx++) {
                for (var ty = y - 1; ty <= y + 1; ty++) {
                    if (costs.get(tx, ty) == 1) f = true;
                }
            }
            var g = xyp_gg(x, y, flag.pos)
            if (f) tower_s = tower_s.concat([[xy_s(x, y), g]])
        }
    }
    tower_s.sort((a, b) => (a[1] - b[1]))
    Memory.rooms[roomName]['build_BigCat'][5]['tower'] = tower_s[0][0]
    Memory.rooms[roomName]['build_BigCat'][6]['rampart/s'][r++] = tower_s[0][0]
    Memory.rooms[roomName]['build_BigCat'][7]['tower'] = tower_s[1][0]
    Memory.rooms[roomName]['build_BigCat'][7]['rampart/s'][r++] = tower_s[1][0]
    Memory.rooms[roomName]['build_BigCat'][8]['tower/s'][r++] = tower_s[2][0]
    Memory.rooms[roomName]['build_BigCat'][8]['rampart/s'][r++] = tower_s[2][0]
    Memory.rooms[roomName]['build_BigCat'][8]['tower/s'][r++] = tower_s[3][0]
    Memory.rooms[roomName]['build_BigCat'][8]['rampart/s'][r++] = tower_s[3][0]
    Memory.rooms[roomName]['build_BigCat'][8]['tower/s'][r++] = tower_s[4][0]
    Memory.rooms[roomName]['build_BigCat'][8]['rampart/s'][r++] = tower_s[4][0]
    for (var i = 0; i < 5; i++) {
        var xy = s_xy(tower_s[i][0])
        costs.set(xy[0], xy[1], 255)
    }
    // visual.text(lab_s[0][1],xy[0],xy[1], {color: 'red',font: 0.4})

    // for(var i = 1;i < lab_s.length;i++){
    //     var s = lab_s[i][0]
    //     var xy = s_xy(s)
    //     visual.text(lab_s[i][1],xy[0],xy[1], {color: 'white',font: 0.4})
    // }
    var flag_controller_pack = BG_path(flag.pos, controller.pos, 3, costs)
    costs = flag_controller_pack.costs
    var path = flag_controller_pack.path
    for (var pos of path) {
        if (Math.abs(pos.x - flag.pos.x) < 3 && Math.abs(pos.y - flag.pos.y) <= 3) continue
        costs.set(pos.x, pos.y, 1)
        Memory.rooms[roomName]['build_BigCat'][3]['road/s'][r++] = pos.x + '/' + pos.y
    }

    var i = 0;
    room.find(FIND_SOURCES).forEach(source => {
        var pack = BG_path(flag.pos, s_p(container_p[i++], roomName), 1, costs)
        costs = pack.costs
        source_path = pack.path
        for (var pos of source_path) {
            if (Math.abs(pos.x - flag.pos.x) < 3 && Math.abs(pos.y - flag.pos.y) <= 3) continue
            costs.set(pos.x, pos.y, 1)
            Memory.rooms[roomName]['build_BigCat'][3]['road/s'][r++] = pos.x + '/' + pos.y
        }
    })
    var ob_s = [], i = 20
    for (var x = flag.pos.x - i; x <= flag.pos.x + i; x++) {
        for (var y = flag.pos.y - i; y <= flag.pos.y + i; y++) {
            if (xyp_distance(x, y, controller.pos) <= 3 || costs.get(x, y) != 0) continue
            var f = false;
            for (var tx = x - 1; tx <= x + 1; tx++) {
                for (var ty = y - 1; ty <= y + 1; ty++) {
                    if (costs.get(tx, ty) == 1) f = true;
                }
            }
            var g = xyp_gg(x, y, flag.pos)
            if (f) ob_s = ob_s.concat([[xy_s(x, y), g]])
        }
    }
    ob_s.sort((a, b) => (a[1] - b[1]))
    Memory.rooms[roomName]['build_BigCat'][8]['observer'] = ob_s[0][0]
    for (var x = 0; x < 50; x++) {
        for (var y = 0; y < 50; y++) {
            if (terrain.get(x, y) == 0 && (xy_xy(x, y, 0) || xy_xy(x, y, 1))) costs.set(x, y, 0)
        }
    }
    // costs = BGC(roomName,costs)

    // costs = BG_rampart(roomName,terrain,costs,flag)


    // for(var x = 0;x < 50;x++){
    //     for(var y = 0;y < 50; y++){
    //         var s = costs.get(x,y)
    //         visual.text(s,x,y + 0.5, {color: 'white',font: 0.3})
    //     }
    // }


}
function BG_rampart(roomName, terrain, oldcosts, flag) {
    var newcosts = new PathFinder.CostMatrix;
    var r = 0;
    Memory.rooms[roomName]['build_BigCat'][4]['rampart/s'] = {}
    var costs = floodFill(roomName, flag.pos.x, flag.pos.y, oldcosts, newcosts, terrain, r)
    return costs

}
function floodFill(roomName, x, y, oldcosts, newcosts, terrain, r) {
    if (x >= 2 && x <= 47 && y >= 2 && y <= 47 && newcosts.get(x, y) != 255) {
        if (terrain.get(x, y) != 1) {
            if (x == 2 || x == 47 || y == 2 || y == 47) {
                newcosts.set(x, y, 100)
                var s = xy_s(x, y), ram = true
                for (var i = 0; i < Object.keys(Memory.rooms[roomName]['build_BigCat'][4]['rampart/s']).length; i++) {
                    if (Memory.rooms[roomName]['build_BigCat'][4]['rampart/s'][i] == s) {
                        ram = false;
                        break
                    }
                }
                if (ram) Memory.rooms[roomName]['build_BigCat'][4]['rampart/s'][r++] = s
                var pack = { newcosts, r }
                return pack
            }
            if (oldcosts.get(x, y) <= 1) {
                var f = true
                for (var cx = x - 2; cx <= x + 2; cx++) {
                    if (!f) break
                    for (var cy = y - 2; cy <= y + 2; cy++) {
                        var tile = terrain.get(cx, cy)
                        var cost_ = oldcosts.get(cx, cy)
                        if (cost_ == 255 && tile != 1) {
                            f = false;
                            break;
                        }
                    }
                }
                if (f) {
                    newcosts.set(x, y, 100)
                    var s = xy_s(x, y), ram = true
                    for (var i = 0; i < Object.keys(Memory.rooms[roomName]['build_BigCat'][4]['rampart/s']).length; i++) {
                        if (Memory.rooms[roomName]['build_BigCat'][4]['rampart/s'][i] == s) {
                            ram = false;
                            break
                        }
                    }
                    if (ram) Memory.rooms[roomName]['build_BigCat'][4]['rampart/s'][r++] = s
                    var pack = { newcosts, r }
                    return pack
                }
            }
            newcosts.set(x, y, 255)
            var pack = floodFill(roomName, x + 1, y, oldcosts, newcosts, terrain, r)
            newcosts = pack.newcosts
            r = pack.r
            pack = floodFill(roomName, x - 1, y, oldcosts, newcosts, terrain, r)
            r = pack.r
            pack = floodFill(roomName, x, y - 1, oldcosts, newcosts, terrain, r)
            r = pack.r
            pack = floodFill(roomName, x + 1, y + 1, oldcosts, newcosts, terrain, r)
            r = pack.r
            pack = floodFill(roomName, x + 1, y - 1, oldcosts, newcosts, terrain, r)
            r = pack.r
            pack = floodFill(roomName, x - 1, y + 1, oldcosts, newcosts, terrain, r)
            r = pack.r
            pack = floodFill(roomName, x - 1, y - 1, oldcosts, newcosts, terrain, r)
            r = pack.r
        }

    }
    var pack = { newcosts, r }
    return pack
}
function newBuild(roomName, level) {
    Memory.rooms[roomName]['building'] = true
    var BG_2 = Memory.rooms[roomName]['build_BigCat'][level]
    var type = null, pos = null;
    console.log(roomName, 'new building:')
    for (var BG_3 in BG_2) {
        var BG_4 = BG_2[BG_3]
        var g = BG_3.split('/')
        var type = g[0], pos = null;
        if (g[1]) {
            for (var BG_5 in BG_4) {
                var BG_6 = BG_4[BG_5]
                var pos = s_p(BG_6, roomName)
                console.log(BG_6, type)
                if (type != 'road') lookRoad(pos)
                pos.createConstructionSite(type)
                var i = Object.keys(Memory.rooms[roomName]['build'][type + '/s']).length
                Memory.rooms[roomName]['build'][type + '/s'][i] = BG_6
                if (type == 'lab') {
                    i = Object.keys(Memory.rooms[roomName]['build']['rampart/s']).length
                    Memory.rooms[roomName]['build']['rampart/s'][i] = BG_6
                }
            }
        } else {
            var pos = s_p(BG_4, roomName)
            console.log(BG_4, type)
            lookRoad(pos)
            pos.createConstructionSite(type)
            if (onlyBuild.indexOf(type) != -1) {
                Memory.rooms[roomName]['build'][type] = BG_4
            } else {
                var i = Object.keys(Memory.rooms[roomName]['build'][type + '/s']).length
                Memory.rooms[roomName]['build'][type + '/s'][i] = BG_4
            }
        }
    }
}
function lookRoad(pos) {
    var look = pos.lookFor(LOOK_STRUCTURES)
    if (look.length == 0) return
    for (var i of look) {
        if (i.structureType == 'road') {
            i.destroy()
            var s = pos.x + '/' + pos.y + '/' + pos.roomName
            for (var b1 in Memory.rooms[pos.roomName]['out_energy']) {
                for (var b2 in Memory.rooms[pos.roomName]['out_energy'][b1]) {
                    if (b2 == 'find' || b2 == 'state') continue
                    for (var b3 in Memory.rooms[pos.roomName]['out_energy'][b1][b2]) {
                        for (var b4 in Memory.rooms[pos.roomName]['out_energy'][b1][b2][b3]) {
                            if (b4 == 'road') {
                                for (var b5 in Memory.rooms[pos.roomName]['out_energy'][b1][b2][b3][b4]) {
                                    if (Memory.rooms[pos.roomName]['out_energy'][b1][b2][b3][b4][b5] == s) {
                                        delete Memory.rooms[pos.roomName]['out_energy'][b1][b2][b3][b4]
                                        console.log(pos, '删除道路')
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return false
}
function BG_lab(roomName, costs, pos) {
    var lab_s = []
    for (var x = 0; x < 50; x++) {
        for (var y = 0; y < 50; y++) {
            var dis = xyp_distance(x, y, pos)
            if (dis > 20) continue
            var f = true
            for (var lx = x; lx <= x + 3; lx++) {
                for (var ly = y; ly <= y + 3; ly++) {
                    if ((lx == x || lx == x + 3) && (ly == y || ly == y + 3)) continue
                    if (lx == ly) {
                        var ll = costs.get(lx, ly)
                        if (ll == 255) {
                            f = false;
                            break
                        } else if (ll == 1) continue
                    }
                    if (costs.get(lx, ly) == 255) f = false
                }
                if (!f) break
            }
            if (f) lab_s = lab_s.concat([[xy_s(x, y), dis]])
        }
    }
    return { costs: costs, lab_s: lab_s };
}
function BGL(roomName, r, x, y,t) {
    for (var tx = x - 2; tx <= x + 2; tx++) {
        for (var ty = y - 2; ty <= y + 2; ty++) {
            if (t.get(tx, ty) == 1) return -1
        }
    }
    Memory.rooms[roomName]['build_BigCat'][1]['spawn'] = xy_s(x, y - 2)
    Memory.rooms[roomName]['build_BigCat'][6]['rampart/s'][r++] = xy_s(x, y - 2)
    Memory.rooms[roomName]['build_BigCat'][2]['container/s'] = {}
    Memory.rooms[roomName]['energyContainer'] = {}
    Memory.rooms[roomName]['energyContainer'][0] = {}
    Memory.rooms[roomName]['energyContainer'][0]['pos'] = xy_s(x - 2, y)
    Memory.rooms[roomName]['energyContainer'][0]['id'] = null;
    Memory.rooms[roomName]['energyContainer'][1] = {}
    Memory.rooms[roomName]['energyContainer'][1]['pos'] = xy_s(x + 2, y)
    Memory.rooms[roomName]['energyContainer'][1]['id'] = null;
    Memory.rooms[roomName]['build_BigCat'][3]['road/s'] = {}
    Memory.rooms[roomName]['build_BigCat'][5]['link/s'] = {}
    Memory.rooms[roomName]['build_BigCat'][2]['extension/s'][r++] = xy_s(x - 2, y - 2)
    Memory.rooms[roomName]['build_BigCat'][2]['extension/s'][r++] = xy_s(x - 1, y - 2)
    Memory.rooms[roomName]['build_BigCat'][2]['extension/s'][r++] = xy_s(x, y - 1)
    Memory.rooms[roomName]['build_BigCat'][2]['extension/s'][r++] = xy_s(x + 1, y - 2)
    Memory.rooms[roomName]['build_BigCat'][2]['extension/s'][r++] = xy_s(x + 2, y - 2)
    Memory.rooms[roomName]['build_BigCat'][2]['container/s'][r++] = xy_s(x - 2, y)
    Memory.rooms[roomName]['build_BigCat'][2]['container/s'][r++] = xy_s(x + 2, y)

    Memory.rooms[roomName]['build_BigCat'][3]['extension/s'][r++] = xy_s(x - 2, y - 1)
    Memory.rooms[roomName]['build_BigCat'][3]['extension/s'][r++] = xy_s(x - 1, y)
    Memory.rooms[roomName]['build_BigCat'][3]['extension/s'][r++] = xy_s(x, y + 1)
    Memory.rooms[roomName]['build_BigCat'][3]['extension/s'][r++] = xy_s(x + 1, y)
    Memory.rooms[roomName]['build_BigCat'][3]['extension/s'][r++] = xy_s(x + 2, y - 1)

    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = xy_s(x - 2, y + 1)
    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = xy_s(x - 2, y + 2)
    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = xy_s(x - 1, y + 2)
    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = xy_s(x + 1, y + 2)
    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = xy_s(x + 2, y + 2)
    Memory.rooms[roomName]['build_BigCat'][4]['extension/s'][r++] = xy_s(x + 2, y + 1)

    Memory.rooms[roomName]['build_BigCat'][7]['link'] = xy_s(x, y)

    Memory.rooms[roomName]['build_BigCat'][7]['spawn'] = xy_s(x, y + 2)
    Memory.rooms[roomName]['build_BigCat'][7]['rampart/s'][r++] = xy_s(x, y + 2)
    for (var i = 1; i < 6; i++) {
        var ud = x - 3 + i;
        var lr = y - 3 + i;
        if (t.get(ud, y - 3) != 1) Memory.rooms[roomName]['build_BigCat'][3]['road/s'][r++] = xy_s(ud, y - 3)
        if (t.get(ud, y + 3) != 1) Memory.rooms[roomName]['build_BigCat'][3]['road/s'][r++] = xy_s(ud, y + 3)
        if (t.get(x - 3, lr) != 1) Memory.rooms[roomName]['build_BigCat'][3]['road/s'][r++] = xy_s(x - 3, lr)
        if (t.get(x + 3, lr) != 1) Memory.rooms[roomName]['build_BigCat'][3]['road/s'][r++] = xy_s(x + 3, lr)
    }
    return r
}
function BG_path_length(begin, e, r) {
    var end = { pos: e, range: r }
    let ret = PathFinder.search(begin, end, {
        plainCost: 2,
        swampCost: 2,
    })
    return ret.path.length
}
function BG_path(begin, e, r, costs) {
    var end = { pos: e, range: r }
    let ret = PathFinder.search(begin, end, {
        plainCost: 2,
        swampCost: 10,
        ignoreCreeps: true,
        roomCallback: function (roomName) {
            let room = Game.rooms[roomName]
            if (!room) return
            room.find(FIND_STRUCTURES).forEach(function (s) {
                var type = s.structureType;
                if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                else if (!s.my || (s.structureType != 'container' && s.structureType != 'rampart')) costs.set(s.pos.x, s.pos.y, 255)
            })
            room.find(FIND_CONSTRUCTION_SITES).forEach(function (s) {
                var type = s.structureType;
                if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                else costs.set(s.pos.x, s.pos.y, 255)
            })
            return costs
        }
    })
    var pack = { path: ret.path, costs: costs }
    return pack
}
function BG_outPath(begin,e){
    var end = { pos: e, range: 2 }
    let ret = PathFinder.search(begin, end, {
        plainCost: 2,
        swampCost : 10,
        ignoreCreeps: true,
        maxOps : 5000,
        roomCallback: function (roomName) {
            let room = Game.rooms[roomName]
            if (!room) return
            let costs = new PathFinder.CostMatrix;
            room.find(FIND_STRUCTURES).forEach(function (s) {
                var type = s.structureType;
                if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                else if (!s.my || (s.structureType != 'container' && s.structureType != 'rampart')) costs.set(s.pos.x, s.pos.y, 255)
            })
            room.find(FIND_CONSTRUCTION_SITES).forEach(function (s) {
                var type = s.structureType;
                if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                else costs.set(s.pos.x, s.pos.y, 255)
            })
            return costs
        }
    })
    return ret.path
}
//缓存255
function BGC(roomName, costs) {
    for (var BG_1 in Memory.rooms[roomName]['build_BigCat']) {
        var BG_2 = Memory.rooms[roomName]['build_BigCat'][BG_1]
        var type = null, pos = null;
        const t = new Room.Terrain(roomName)
        for (var BG_3 in BG_2) {
            var BG_4 = BG_2[BG_3]
            var g = BG_3.split('/')
            var type = g[0], pos = null;
            if (g[1]) {
                for (var BG_5 in BG_4) {
                    var BG_6 = BG_4[BG_5]
                    if (type == 'road') {
                        if (t.get(BG_6.split('/')[0], BG_6.split('/')[1]) == 1) delete Memory.rooms[roomName]['build_BigCat'][BG_1][BG_3][BG_5]
                        costs.set(BG_6.split('/')[0], BG_6.split('/')[1], 1)
                    } else if (type == 'container') costs.set(BG_6.split('/')[0], BG_6.split('/')[1], 2)
                    else costs.set(BG_6.split('/')[0], BG_6.split('/')[1], 255)
                }
            } else {
                costs.set(BG_4.split('/')[0], BG_4.split('/')[1], 255)
            }
        }
    }
    return costs
}
function outRoom(roomName) {
    var pos0 = roomName.charAt(0)
    var pos1 = roomName.split(pos0)[1]
    var pos2 = 'N'
    var pos3 = pos1.split(pos2)
    if (pos3.length != 2) {
        pos2 = 'S'
        pos3 = pos1.split(pos2)
    }
    var pos_left, pos_right, pos_up, pos_bottom;
    var room_x = parseInt(pos3[0]), room_y = parseInt(pos3[1])
    if (pos0 == 'W') {
        pos_left = room_x + 1;
        pos_right = room_x - 1;
    } else {
        pos_left = room_x - 1;
        pos_right = room_x + 1;
    }
    if (pos2 == 'N') {
        pos_up = room_y + 1;
        pos_bottom = room_y - 1;
    } else {
        pos_up = room_y - 1;
        pos_bottom = room_y + 1;
    }
    var room_left = pos0 + pos_left + pos2 + room_y, room_right = pos0 + pos_right + pos2 + room_y
    var room_up = pos0 + room_x + pos2 + pos_up, room_bottom = pos0 + room_x + pos2 + pos_bottom
    let costs = new PathFinder.CostMatrix;
    const terrain = new Room.Terrain(roomName)
    var up = false, bottom = false, left = false, right = false;
    for (var i = 1; i < 49; i++) {
        if (!up && terrain.get(i, 0) != TERRAIN_MASK_WALL) up = true
        if (!left && terrain.get(0, i) != TERRAIN_MASK_WALL) left = true
        if (!bottom && terrain.get(i, 49) != TERRAIN_MASK_WALL) bottom = true
        if (!right && terrain.get(49, i) != TERRAIN_MASK_WALL) right = true
    }
    var outEnergyName = []
    if (up) outEnergyName.push(room_up)
    if (left) outEnergyName.push(room_left)
    if (bottom) outEnergyName.push(room_bottom)
    if (right) outEnergyName.push(room_right)
    for (var i = 0; i < outEnergyName.length; i++) {
        var outName = outEnergyName[i]
        if (outName.split('0').length == 2) {
            Memory.rooms[roomName]['aisle'][outName] = {}
            Memory.rooms[roomName]['aisle']['open'] = true
        } else {
            Memory.rooms[roomName]['out_energy'][outName] = {}
        }
    }
}
function deleteRoom(flag) {
    var roomName = flag.pos.roomName;
    if (Memory.rooms[roomName]) delete Memory.rooms[roomName]
    var room = flag.room
    if(room)room.controller.unclaim()
    console.log('房间', roomName, '已unclaim并清除缓存')
    return flag.remove();
}
function visualBuild(visual, type, x, y) {
    switch (type) {
        case 'spawn':
            visual.circle(x, y, { fill: 'white', radius: 0.65, opacity: 0.6 })
            visual.circle(x, y, { fill: 'black', radius: 0.55, opacity: 0.8 })
            visual.circle(x, y, { fill: 'yellow', radius: 0.35, opacity: 0.8 })
            break;
        case 'extension':
            visual.circle(x, y, { fill: 'green', radius: 0.4, opacity: 0.7 })
            visual.circle(x, y, { fill: 'black', radius: 0.35, opacity: 0.7 })
            visual.circle(x, y, { fill: 'yellow', radius: 0.3, opacity: 0.7 })
            break;
        case 'link':
            var points1 = [[x, y - 0.45], [x - 0.35, y], [x, y + 0.45], [x + 0.35, y], [x, y - 0.45], [x - 0.35, y]]
            var points2 = [[x, y - 0.3], [x - 0.25, y], [x, y + 0.3], [x + 0.25, y], [x, y - 0.3], [x - 0.25, y]]
            visual.poly(points1, { stroke: 'green', opacity: 0.8, strokeWidth: 0.07 })
            visual.poly(points2, { stroke: 'black', opacity: 0.8, strokeWidth: 0.07, fill: 'grey' })
            break;
        case 'road':
            visual.circle(x, y, { fill: 'orange', radius: 0.2, opacity: 0.8 })
            break;
        case 'constructedWall':
            visual.circle(x, y, { fill: 'black', radius: 0.5, opacity: 0.6 })
            break;
        case 'rampart':
            visual.rect(x - 0.5, y - 0.5, 1, 1, { stroke: 'green', fill: 'green', opacity: 0.3 })
            break;
        case 'storage':
            visual.rect(x - 0.5, y - 0.7, 1, 1.4, { stroke: 'green', fill: 'black', opacity: 0.8 })
            visual.rect(x - 0.4, y - 0.5, 0.8, 0.5, { fill: 'grey', opacity: 0.8 })
            visual.rect(x - 0.4, y, 0.8, 0.5, { fill: 'yellow', opacity: 0.8 })
            break;
        case 'observer':
            visual.circle(x, y, { fill: 'green', radius: 0.5, opacity: 0.8 })
            visual.circle(x, y, { fill: 'black', radius: 0.45, opacity: 1 })
            visual.circle(x + 0.2, y, { fill: 'green', radius: 0.25, opacity: 0.8 })
            break;
        case 'powerSpawn':
            visual.circle(x, y, { fill: 'white', radius: 0.8, opacity: 0.6 })
            visual.circle(x, y, { fill: 'red', radius: 0.75, opacity: 0.8 })
            visual.circle(x, y, { fill: 'black', radius: 0.65, opacity: 0.8 })
            visual.circle(x, y, { fill: 'red', radius: 0.4, opacity: 0.8 })
            break;
        case 'extractor':
            visual.circle(x, y, { stroke: 'green', strokeWidth: 0.2, radius: 0.74, fill: false, lineStyle: 'dashed' })
            break;
        case 'terminal':
            var points1 = [[x, y - 0.85], [x - 0.5, y - 0.5], [x - 0.85, y], [x - 0.5, y + 0.5], [x, y + 0.85], [x + 0.5, y + 0.5], [x + 0.85, y], [x + 0.5, y - 0.5], [x, y - 0.85], [x - 0.5, y - 0.5]]
            var points2 = [[x, y - 0.75], [x - 0.45, y - 0.45], [x - 0.75, y], [x - 0.45, y + 0.45], [x, y + 0.75], [x + 0.45, y + 0.45], [x + 0.75, y], [x + 0.45, y - 0.45], [x, y - 0.75], [x - 0.45, y - 0.45]]
            visual.poly(points1, { stroke: 'green', opacity: 1, strokeWidth: 0.07 })
            visual.poly(points2, { fill: 'grey', stroke: 'black', opacity: 1, strokeWidth: 0.07 })
            visual.rect(x - 0.4, y - 0.4, 0.8, 0.8, { stroke: 'black', strokeWidth: 0.1, fill: 'yellow', opacity: 0.8 })
            break;
        case 'lab':
            visual.circle(x, y, { fill: 'green', radius: 0.5, opacity: 0.8 })
            visual.rect(x - 0.4, y + 0.2, 0.8, 0.3, { fill: 'green', opacity: 0.8 })
            visual.circle(x, y, { fill: 'black', radius: 0.45, opacity: 0.8 })
            visual.circle(x, y, { fill: 'white', radius: 0.35, opacity: 0.8 })
            visual.rect(x - 0.35, y + 0.25, 0.7, 0.2, { fill: 'black', opacity: 0.8 })
            visual.rect(x - 0.2, y + 0.3, 0.4, 0.1, { fill: 'yellow', opacity: 0.8 })
            break;
        case 'container':
            visual.rect(x - 0.25, y - 0.3, 0.5, 0.6, { stroke: 'black', strokeWidth: 0.1, fill: 'yellow', opacity: 0.8 })
            break;
        case 'nuker':
            var points1 = [[x, y - 1.5], [x - 0.7, y], [x - 0.7, y + 0.7], [x + 0.7, y + 0.7], [x + 0.7, y], [x, y - 1.5], [x - 0.7, y]]
            var points2 = [[x, y - 1.3], [x - 0.6, y], [x - 0.6, y + 0.6], [x + 0.6, y + 0.6], [x + 0.6, y], [x, y - 1.3], [x - 0.6, y], [x + 0.6, y]]
            visual.poly(points1, { stroke: 'green', opacity: 0.8, strokeWidth: 0.2 })
            visual.poly(points2, { stroke: 'black', opacity: 0.8, strokeWidth: 0.2, fill: 'grey' })
            break;
        case 'factory':
            visual.circle(x, y, { fill: 'black', radius: 0.6, opacity: 1 })
            visual.line(x - 0.2, y - 0.8, x - 0.2, y + 0.8, { color: 'black', opacity: 0.8 })
            visual.line(x + 0.2, y - 0.8, x + 0.2, y + 0.8, { color: 'black', opacity: 0.8 })
            visual.line(x - 0.8, y - 0.2, x + 0.8, y - 0.2, { color: 'black', opacity: 0.8 })
            visual.line(x - 0.8, y + 0.2, x + 0.8, y + 0.2, { color: 'black', opacity: 0.8 })
            break;
        case 'tower':
            visual.circle(x, y, { stroke: 'green', fill: false, radius: 0.6, opacity: 0.8 })
            visual.circle(x, y, { fill: 'black', radius: 0.55, opacity: 0.9 })
            visual.rect(x - 0.35, y - 0.25, 0.7, 0.5, { fill: 'grey', opacity: 0.8 })
            visual.rect(x - 0.25, y - 0.85, 0.5, 0.6, { fill: 'black', opacity: 0.8 })
            visual.rect(x - 0.2, y - 0.8, 0.4, 0.5, { fill: 'grey', opacity: 0.8 })
            break;
    }
    return visual
}
function visualRoom(roomName) {
    const beginCPU = Game.cpu.getUsed();
    if (!Memory.rooms[roomName]) return -1
    var visual = new RoomVisual(roomName)
    if (!Memory.rooms[roomName]) return flag.remove()
    for (var BG_1 in Memory.rooms[roomName]['build_BigCat']) {
        var BG_2 = Memory.rooms[roomName]['build_BigCat'][BG_1]
        var type = null, pos = null;
        for (var BG_3 in BG_2) {
            var BG_4 = BG_2[BG_3]
            var g = BG_3.split('/')
            var type = g[0], pos = null;
            if (g[1]) {
                for (var BG_5 in BG_4) {
                    var BG_6 = BG_4[BG_5]
                    if (BG_6 == 0) continue
                    pos = s_p(BG_6, roomName)
                    visual = visualBuild(visual, type, pos.x, pos.y)
                    visual.text(BG_1, pos.x - 0.2, pos.y + 0.1, { color: 'red', font: 0.5 })
                    if (type != 'road' && type != 'rampart') visual.text(type, pos.x, pos.y + 0.2, { color: 'blue', font: 0.3 })
                }
            } else {
                pos = s_p(BG_4, roomName)
                visual = visualBuild(visual, type, pos.x, pos.y)
                visual.text(BG_1, pos.x + 0.2, pos.y + 0.1, { color: 'white', font: 0.5 })
                visual.text(type, pos.x, pos.y + 0.2, { color: 'blue', font: 0.3 })
            }
        }
    }
    
    console.log(Game.time, 'visual[CPU]', Game.cpu.getUsed() - beginCPU)
}
function cachebuild(roomName) {
    for (var b1 in Memory.rooms[roomName]['build']) {
        var b2 = Memory.rooms[roomName]['build'][b1]
        var s1 = b1.split('/')
        var type = s1[0], pos = null;
        if (s1.length == 1) {
            if (!b2) continue
            pos = s_p(b2, roomName)
            var b = pos.lookFor(LOOK_STRUCTURES)
            var f = true;
            for (var t of b) {
                if (t.structureType == type) f = false
            }
            if (f) pos.createConstructionSite(type)
        } else {
            for (var b3 in b2) {
                var b4 = b2[b3]
                pos = s_p(b4, roomName)
                var b = pos.lookFor(LOOK_STRUCTURES)
                var f = true;
                for (var t of b) {
                    if (t.structureType == type) f = false
                }
                var c = pos.lookFor(LOOK_CONSTRUCTION_SITES)
                for (var t of c) {
                    if (t.structureType == type) f = false
                }
                if (f) pos.createConstructionSite(type)
            }
        }
    }
    if (Memory.rooms[roomName]['level'] < 4 || Game.time % 200 || !Memory.rooms[roomName]['out_energy_ob']) return
    for (var b1 in Memory.rooms[roomName]['out_energy']) {
        var b2 = Memory.rooms[roomName]['out_energy'][b1]
        for (var b3 in b2) {
            if (b3 == 'find') continue
            var b4 = b2[b3]
            for (var b5 in b4) {
                var b6 = b4[b5]
                for (var b7 in b6) {
                    if (b7 != 'road/s') continue
                    var b8 = b6[b7]
                    for (var b9 in b8) {
                        var b10 = b8[b9]
                        var t = b10.split('/')
                        var pos = new RoomPosition(t[0], t[1], t[2])
                        if (Game.rooms[t[2]]) pos.createConstructionSite(STRUCTURE_ROAD)
                    }
                }
            }
        }
    }
}
function roomNewBuild() {
    for (var i in Game.constructionSites) {
        var site = Game.constructionSites[i]
        var type = site.structureType
        if (type == 'constructedWall') type = 'wall'
        var roomName = site.pos.roomName
        if (!Memory.rooms[roomName]) break;
        var s = p_s(site.pos)
        for (var b1 in Memory.rooms[roomName]['build']) {
            var b2 = Memory.rooms[roomName]['build'][b1]
            var s1 = b1.split('/')
            var have_type = s1[0], pos = null;
            if (have_type != type) continue
            if (s1.length == 1) {
                if (b2) continue
                jumpToRoom(roomName,0,'添加新建筑:' + s + type)
                Memory.rooms[roomName]['build'][b1] = s
            } else {
                var f = true, j = 0;
                for (var j in Memory.rooms[roomName]['build'][b1]) {
                    if (Memory.rooms[roomName]['build'][b1][j] == s) {
                        f = false
                        break
                    }
                }
                if (!f) break
                else {
                    if (Object.keys(Memory.rooms[roomName]['build'][b1]).length == 0) Memory.rooms[roomName]['build'][b1][0] = s
                    else Memory.rooms[roomName]['build'][b1][++j] = s
                    jumpToRoom(roomName,0,'添加新建筑:' + s + type)
                }
            }
        }
    }
}
function deleteRoomBuild(flag, type) {
    const beginCpu = Game.cpu.getUsed()
    if (type == 'wall') type = 'constructedWall';
    var pos = flag.pos
    var roomName = pos.roomName
    var s = p_s(pos),os = pos.x + '/' + pos.y + '/' + pos.roomName
    var builds = pos.lookFor(LOOK_STRUCTURES)
    var site = pos.lookFor(LOOK_CONSTRUCTION_SITES)[0]
    if(builds.length > 0){
        for (var build of builds) {
            var buildtype = build.structureType
            if(buildtype == type){
                build.destroy()
                break
            }
        }
    }
    if(site)site.remove()
    if(onlyBuild.indexOf(type) != -1) Memory.rooms[roomName]['build'][type] = null
    else{
        for(var i in Memory.rooms[roomName]['build'][type + '/s']){
            if( Memory.rooms[roomName]['build'][type + '/s'][i] == s){
                delete Memory.rooms[roomName]['build'][type + '/s'][i]
                console.log(pos, '建筑缓存已清除')
                break
            }
        }
        let outf = false
        for(var outName in Memory.rooms[roomName]['out_energy']){
            if(outf)break
            for(var i in Memory.rooms[roomName]['out_energy'][outName]['energy']){
                if(outf)break
                for(var road_s in Memory.rooms[roomName]['out_energy'][outName]['energy'][i]['road/s']){
                    if(Memory.rooms[roomName]['out_energy'][outName]['energy'][i]['road/s'][road_s] == os){
                        delete Memory.rooms[roomName]['out_energy'][outName]['energy'][i]['road/s'][road_s]
                        console.log(pos, '外矿道路缓存已刷新')
                        outf = true
                        break
                    }
                }
            }
        }
    }
    flag.remove()
    return console.log(flag,'[CPU]:',Game.cpu.getUsed() - beginCpu)
}
//房间内爬爬分类
function creepHome(creep,workType) {
    var type = workType.split('/')
    var roomName = type[0]
    if (!Memory.rooms[roomName]) return creep.suicide()
    if (creep.room.name != roomName) {
        creep.moveTo(xy_p(25, 25, roomName))
        return creep.say('back')
    }
    switch (type[2]) {
        case 'source':
            creepHarvest(creep, roomName)
            break;
        case 'carry':
            creepCarry(creep, roomName)
            break;
        case 'up':
            creepUp(creep, roomName)
            break;
        case 'build':
            creepBuild(creep, roomName)
            break;
        case 'repair':
            creepRepair(creep, roomName)
            break;
        case 'miner':
            creepMine(creep, roomName)
            break;
        case 'defender':
            creepDefend(creep, roomName)
            break;
        case 'wall':
            creepWall(creep, roomName)
            break;
    }
}
//外矿爬分类
function creepOutEnergy(creep) {
    var type = creep.name.split('/')
    var roomName = type[0]
    if (!Memory.rooms[roomName]) return creep.suicide()
    var outName = type[3]
    switch (type[2]) {
        case 'harvester':
            creepOutHarvest(creep, roomName, outName)
            break;
        case 'carryer':
            creepOutCarry(creep, roomName, outName)
            break;
        case 'claimer':
            creepOutClaim(creep, outName)
            break;
        case 'dfer':
            creepOutDf(creep, roomName, outName)
            break;
    }
}

//炮台防御
function towerAttack(room){
    var enemy = room.find(FIND_HOSTILE_CREEPS)[0]
    if(!enemy){
        jumpToRoom(room.name,0,'房间内有敌人已消灭');
        if(Memory.rooms[room.name]['creeps']['work_defend']['num'] > 0)Memory.rooms[room.name]['creeps']['work_defend']['num'] == 0
        return Memory.rooms[room.name]['state'] = 's'
    }
    room.find(FIND_STRUCTURES,{filter:t=>t.structureType == STRUCTURE_TOWER && t.store[e] > 0}).forEach(s=>{
        s.attack(enemy)
    })
}
//家里
//中心资源配置(默认3000)
var centerConfig = {
    storage_energy : 500000,
    terminal_energy: 50000,
    terminal_other: 3000,
    ore: ['U', 'O', 'H', 'Z', 'L', 'K', 'X'],
    bar: [RESOURCE_UTRIUM_BAR, RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_ZYNTHIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_PURIFIER],
    deposits: [RESOURCE_MIST, RESOURCE_BIOMASS, RESOURCE_METAL, RESOURCE_SILICON],
    other: [RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID],
    t0: ['G','OH'],
    t1: [],
    t2: ['UH2O','LHO2','UHO2'],
    t3: ['XUH2O','XKHO2','XLHO2','XZHO2','XGHO2','XZH2O','XGH2O'],
    storage_ore_Max : 20000,
    storage_bar_Max : 20000
}
//调整
function adjust(creep, creep_type, w, t, type, amount) {
    if (creep_type && creep_type != type){
        if(creep.transfer(creep.room.storage, creep_type) == OK){
            creep.say(t.structureType)
            return false
        }
    }
    if (amount == 0) {
        if ((creep.store.getUsedCapacity() == 0 && creep.withdraw(w, type) == OK) || (creep.store[type] > 0 && creep.transfer(t, type) == OK)){
            creep.say(t.structureType)
            return false
        }
    } else {
        if(creep.store[type] >= amount){
            if(creep.transfer(t, type) == OK){
                creep.say(t.structureType)
                return false
            }
        }else{
            amount = amount - creep.store[type]
            if(creep.withdraw(w, type, amount) == OK){
                creep.say(t.structureType)
                return false
            }
        }
        return creep.transfer(creep.room.storage,creep_type);
    }
    return true
}
//terminal
function dealTerminal(storage,roomName,terminal){
    //原矿 => bar
    if(!Memory.rooms[roomName]['factory']['on-off'] && !Memory.rooms[roomName]['factory']['fill'] && storage.store[e] > 100000){
        for(var i of centerConfig.ore){
            if(terminal.store[i] >= centerConfig.terminal_other && storage.store[i] > centerConfig.storage_ore_Max){
                var amount = Math.min(Math.ceil((storage.store[i] - 9000)/500)*500,30000)
                var to_type = centerConfig.bar[centerConfig.ore.indexOf(i)]
                Memory.rooms[roomName]['factory']['fill'] = true
                Memory.rooms[roomName]['factory']['from_type'] = [i]
                Memory.rooms[roomName]['factory']['from_amount'] = [amount]
                Memory.rooms[roomName]['factory']['to_type'] = to_type
                jumpToRoom(roomName,0,'工厂添加任务:'+'['+i+']'+amount+'=>'+bar[to_type])
                break
            }
        }
    }
    //平衡能量(其他房间都有一定能量的话会卖出能量)
    if((terminal.store[e] >= centerConfig.terminal_energy && storage.store[e] >= centerConfig.storage_energy) || storage.store.getFreeCapacity() < 50000){
        for(var helpName in Memory.rooms){
            if(helpName == roomName)continue
            var room_ = Game.rooms[helpName]
            if(!room_.terminal)continue
            if(room_.storage.store[e] < 200000){
                if(terminal.send(e,10000,helpName) == OK){
                    console.log(roomName,'发送能量10K(平衡) =>',helpName);
                    return
                }
            }
        }
        var f = dealSell(roomName,e,10000)
        if(f == 0){
            console.log(roomName,'卖出能量')
            return
        }
    }
    //自动援助(能量)
    if(Object.keys(Memory.rooms).length > 1 && storage.store[e] < 50000 && terminal.store[e] <= centerConfig.terminal_energy){
        dealHelpResource(roomName,e,10000)
    }
    //平衡原矿bar
    for(var i of centerConfig.bar){
        if(terminal.store[i] >= centerConfig.terminal_other && storage.store[i] > centerConfig.storage_bar_Max){
            for(var helpName in Memory.rooms){
                if(helpName == roomName)continue
                var room_ = Game.rooms[helpName]
                if(!room_.terminal)continue
                if(room_.storage.store[i] + room_.terminal.store[i] < 10000){
                    if(terminal.send(i,1000,helpName) == OK){
                        console.log(roomName,'发送',i,'1000(平衡) =>',helpName);
                        return
                    }
                }
            }
            // var f = dealSell(roomName,i,1000)
            // console.log(roomName,'出售',i,f)
            // if(f == 0){
            //     console.log(roomName,'卖出能量')
            //     return
            // }
        }
    }
}
function dealHelpResource(roomName,type,need){
    var amount = 6000
    if(type == e) amount = 50000
    for(var helpName in Memory.rooms){
        if(helpName == roomName)continue
        var room_ = Game.rooms[helpName]
        var storage_ = room_.storage
        var terminal_ = room_.terminal
        if(!terminal_ || terminal_.cooldown > 0 || terminal_.store[type] + storage_.store[type] < amount)continue
        var f = terminal_.send(type,need,roomName)
        if(f == OK){
            jumpToRoom(roomName,helpName + ' 自动援助 '+type+ ' '+need+ ' =>',0)
            return true
        }
    }
    return false
}
function dealSell(roomName,type,amount){
    const orders = Game.market.getAllOrders({type:'buy',resourceType:type})
    if(orders.length == 0)return -1//市场没有这个东西卖了
    var maxprice = 0;
    var o = orders[0]
    for(var order of orders){
        if(order.price > maxprice){
            maxprice = order.price
            o = order
        }
    }if(roomName == 0)return Game.market.deal(o.id,amount)
    return Game.market.deal(o.id,amount,roomName)
}
function dealBuy(roomName,type,amount){
    const orders = Game.market.getAllOrders({type:'sell',resourceType:type})
    if(orders.length == 0)return -1//市场没有这个东西买了
    var minprice = 100;
    var o = orders[0]
    for(var order of orders){
        if(order.price < minprice){
            minprice = order.price
            o = order
        }
    }
    return Game.market.deal(o.id,amount,roomName)
}
function labT123(type,roomName,creep,creep_type,storage,terminal){
    if (terminal.store[type] > centerConfig.terminal_other && storage.store.getFreeCapacity() > terminal.store[type] - centerConfig.terminal_other) {
        var amount = Math.min(terminal.store[type] - centerConfig.terminal_other, creep.store.getCapacity())
        if (!adjust(creep, creep_type, terminal, storage, type, amount)) return false
    }
    if (terminal.store[type] < centerConfig.terminal_other){
        let need = centerConfig.terminal_other - terminal.store[type]
        if(storage.store[type] + creep.store[type] >= need) {
            var amount = Math.min(need, creep.store.getCapacity())
            if (!adjust(creep, creep_type, storage, terminal, type, amount)) return false
        }else{
            let ts = terminal.store[type],ss = storage.store[type],all = ts + ss + creep.store[type];
            if(all < 3000){
                if(Memory.rooms[roomName]['lab']['state'] == 'finish' && !Memory.rooms[roomName]['lab']['task']['type'] && !Memory.rooms[roomName]['lab']['task']['amount']){
                    jumpToRoom(roomName,0,'lab 添加任务:' + '合成 3000 ' + type)
                    Memory.rooms[roomName]['lab']['task']['type'] = type
                    Memory.rooms[roomName]['lab']['task']['amount'] = 3000
                }
            }
        }
    }
    return true
}

//factory
function dealFactory(roomName,factory){
    if(Memory.rooms[roomName]['factory']['on-off'] && Memory.rooms[roomName]['factory']['cd'] < Game.time){
        var cd = factory.cooldown
        if(cd != 0){
            Memory.rooms[roomName]['factory']['cd'] = Game.time + cd
        }
    }
    if(!Memory.rooms[roomName]['factory']['on-off'] || Memory.rooms[roomName]['factory']['cd'] > Game.time)return
    var to_type = Memory.rooms[roomName]['factory']['to_type']
    var f = factory.produce(to_type)
    if(f != OK && f != ERR_TIRED){
        Memory.rooms[roomName]['factory']['finish'] = true
    }
}
//工厂是否在工作
function factoryWorkF(roomName){
    if(!Memory.rooms[roomName]['factory']['fill'] && !Memory.rooms[roomName]['factory']['on-off'] && !Memory.rooms[roomName]['factory']['finish']){
        return false
    }
    return true
}
const labeff = {
    
}
//lab
var labs, needs, labcreep,efficiency;
const reaction = 'reaction',fill = 'fill',finish = 'finish';
function centerLab(roomName) {
    // var testName = 'W4N9'
    // if(roomName == testName){
    //     console.log()
    //     console.log('test_lab',Memory.rooms[roomName]['lab'].state)
    // }
    var need_type = Memory.rooms[roomName]['lab']['task']['type']
    var need_amount = Memory.rooms[roomName]['lab']['task']['amount']
    if(!need_type || !need_amount)return
    // efficiency = Memory.rooms[roomName]['lab']['efficiency']
    efficiency = 0
    labcreep = Game.creeps['laber' + roomName]
    // console.log('[lab task]=>[type]:',need_type,'[amount]:',need_amount,'[state]:',Memory.rooms[roomName]['lab'].state,'[效率等级]:',eff);
    labs = new Array(); 
    var _id = 0;
    var v = new RoomVisual(roomName)
    for (var labid of Memory.rooms[roomName]['lab']['labs']) {
        labs.push(Game.getObjectById(labid))
        v.text(_id, labs[_id].pos.x, labs[_id].pos.y - 0.1, { color: 'white', font: 0.3 })
        if (labs[_id].mineralType) v.text(labs[_id].mineralType, labs[_id].pos.x, labs[_id].pos.y + 0.2, { color: 'black', font: 0.4 })
        else v.text("null", labs[_id].pos.x, labs[_id].pos.y + 0.2, { color: 'black', font: 0.4 })
        _id++;
    }
    needs = [];
    pushMission([need_type, need_amount], roomName)
    if (needs.length >= 1) {
        var product = needs[needs.length - 1][0], amount = Math.min(3000, needs[needs.length - 1][1]);
        var materials = findMaterial(product)
    }
    // if(roomName == testName)console.log('房间', roomName, '需要:', needs, '当前材料:', materials)
    if (amount % (5 + efficiency)) amount += (5 + efficiency) - amount % (5 + efficiency);
    //反应完成时
    if (materials == null){
        Memory.rooms[roomName]['lab'].state = finish
        if(needs.length >= 1) {
            if (Game.time % 10 == 0) jumpToRoom(roomName,0,'缺少' + amount + product)
        }else{
            if(labcreep){
                var mission = false;
                labs.forEach(lab => {
                    if(mission == false && lab.mineralType){
                        var room = labcreep.room
                        if(labcreep)labcreep.say('回收:'+lab.mineralType)
                        CWT(labcreep,lab,room.storage,lab.mineralType,lab.store[lab.mineralType])
                        mission = true;
                    }
                });
                if(!mission){
                    if(labcreep.store.getUsedCapacity() > 0){
                        labcreep.say('回收lab:'+need_type)
                        var terminal = labcreep.room.terminal
                        var f = labcreep.transfer(terminal,Object.keys(labcreep.store)[0])
                        if(f == OK)return labcreep.suicide();
                        if(f == ERR_NOT_IN_RANGE)labcreep.moveTo(terminal)
                    }else{
                        jumpToRoom(roomName,0,' lab 任务完成')
                        Memory.rooms[roomName]['lab']['task']['amount'] = null;
                        Memory.rooms[roomName]['lab']['task']['type'] = null;
                    }
                }else return
            }else if(get_s_t(Game.rooms[roomName],need_type) < need_amount){
                autoSpawnCreep(roomName)
            }else{
                jumpToRoom(roomName,0,'lab 任务完成')
                Memory.rooms[roomName]['lab']['task']['amount'] = null;
                Memory.rooms[roomName]['lab']['task']['type'] = null;
            }
        }
        return
    }
    var state = Memory.rooms[roomName]['lab'].state
    //反应 => 完成
    if(state == reaction && (!labs[0].mineralType || !labs[1].mineralType || labs[0].store[labs[0].mineralType] < (5 + efficiency) || labs[1].store[labs[1].mineralType] < (5 + efficiency))){
        state = finish
    }
    //完成 => 填充
    if(state == finish){
        var allclear = true;
        labs.forEach(lab => {
            if(lab.mineralType)allclear = false;
        });
        if(allclear){
            state = fill
        }
    }
    //填充 => 反应
    if(state == fill){
        if(materials && labs[0].store[materials[0]] >= amount && labs[1].store[materials[1]] >= amount){
            state = reaction
        }
    }
    Memory.rooms[roomName]['lab'].state = state
    //反应
    if(state == reaction && Game.time % REACTION_TIME[product] == 0){
        if(labcreep)labcreep.suicide();
        for(var i = 2;i<labs.length;i++){
            if(labs[i]){
                if(labs[i].runReaction(labs[0],labs[1]) != OK){
                    console.log(roomName,'lab反应完成')
                    state = finish;
                }
            }
        }
    }
    //填充
    if(state == fill){
        if(!labcreep){
            autoSpawnCreep(roomName)
        }else{
            var w,storage = Game.rooms[roomName].storage,terminal = Game.rooms[roomName].terminal;
            var type = materials[0]
            var _lab = labs[0]
            if(room.name == 'W8N7')console.log('test_lab == ',type)
            if(!_lab.mineralType || _lab.store[type] < amount){
                labcreep.say('lab0:'+type)
                if(_lab.mineralType && _lab.mineralType != type){
                    var wamount = Math.min(_lab.store[_lab.mineralType],labcreep.store.getCapacity())
                    CWT(labcreep,_lab,storage,_lab.mineralType,wamount)
                }else{
                    if(storage.store[type] > 0) w = storage;
                    else w = terminal;
                    if(_lab.store[type] > 0)amount -= _lab.store[type];
                    if(labcreep.store[type] >= amount)w = null;
                    var wamount = Math.min(amount,labcreep.store.getCapacity())
                    CWT(labcreep,w,_lab,type,wamount)
                }
            }else {
                type = materials[1]
                _lab = labs[1]
                labcreep.say('lab1:'+type)
                if(_lab.mineralType && _lab.mineralType != type){
                    var wamount = Math.min(_lab.store[_lab.mineralType],labcreep.store.getCapacity())
                    CWT(labcreep,_lab,storage,_lab.mineralType,wamount)
                }else{
                    if(storage.store[type] > 0) w = storage;
                    else w = terminal;
                    if(_lab.store[type] > 0)amount -= _lab.store[type];
                    if(labcreep.store[type] >= amount)w = null;
                    var wamount = Math.min(amount,labcreep.store.getCapacity())
                    CWT(labcreep,w,_lab,type,wamount)
                }
            }
        }
    }
    //完成
    if(state == finish){
        if(!labcreep){
            if(!labs[0].mineralType || !labs[1].mineralType || labs[0].mineralType != materials[0] || labs[1].mineralType != materials[1] || labs[0].store[labs[0].mineralType] < (5 + efficiency) || labs[1].store[labs[1].mineralType] < (5 + efficiency))autoSpawnCreep(roomName)
        }else{
            var mission = false;
            labs.forEach(lab => {
                if(mission == false && lab.mineralType){
                    var room = labcreep.room
                    if(labcreep)labcreep.say('回收:'+lab.mineralType)
                    CWT(labcreep,lab,room.storage,lab.mineralType,lab.store[lab.mineralType])
                    mission = true;
                }
            });
        }
    }
}
const labbody = [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE]
function autoSpawnCreep(roomName){
    var spawn = getSpawn(roomName)
    if(spawn)spawn.spawnCreep(labbody,'laber' + roomName)
}
function CWT(creep,w,t,type,amount){
    // if(creep.room.name == 'W4N9')console.log(creep,w.pos,t,type,amount)
    var c = Object.keys(creep.store)[0]
    if(creep.store.getUsedCapacity() > 0){
        if(c != type){
            var storage = creep.room.storage
            if(creep.transfer(storage,c) == nir)return creep.moveTo(storage);
        }else{
            if(creep.transfer(t,type) == nir)return creep.moveTo(t);
        }
    }else if(w){
        
        if(w.store[type] < amount)amount = w.store[type]
        if(creep.withdraw(w,type,Math.min(amount,creep.store.getUsedCapacity())) == nir)return creep.moveTo(w);
    }
}
function findMaterial(product) {
    for (var i in REACTIONS) {
        for (var j in REACTIONS[i]) {
            if (REACTIONS[i][j] == product) {
                return [i, j]
            }
        }
    }
    return null
}
function getAllType(room, type) {
    var amount = 0;
    amount += room.storage.store[type]
    amount += room.terminal.store[type]
    labs.forEach(lab => {
        amount += lab.store[type];
    });
    if (labcreep) amount += labcreep.store[type]
    return amount;
}
function get_s_t(room,type){
    var amount = 0;
    var storage = room.storage,terminal = room.terminal
    if(storage)amount += room.storage.store[type]
    if(terminal)amount += room.terminal.store[type]
    if(labcreep)amount += labcreep.store[type]
    return amount;
}
function pushMission(mission, roomName) {
    mission[1] -= getAllType(Game.rooms[roomName], mission[0])
    if (mission[1] <= 0) return;
    else {
        needs.push(mission)
        var materials = findMaterial(mission[0])
        if (materials) {
            pushMission([materials[0], mission[1]], roomName)
            pushMission([materials[1], mission[1]], roomName)
        }
    }
}
function labsInit(level, room, roomName) {
    var labs = room.find(FIND_STRUCTURES, { filter: o => (o.structureType == STRUCTURE_LAB) })
    labs.forEach(lab => {
        lab.value = 0;
        labs.forEach(l => {
            if (lab.pos.inRangeTo(l, 2)) {
                lab.value++;
            }
        });
    });
    labs.sort((a, b) => (b.value - a.value));
    for (var i = 0; i < labs.length; i++) {
        labs[i] = labs[i].id;
    }
    Memory.rooms[roomName]['lab']['labs'] = labs;
    if ((level == 6 && labs.length == 3) || (level == 7 && labs.length == 6) || (level == 8 && labs.length == 10)) {
        console.log('房间', roomName, 'lab更新成功')
    } else {
        console.log('房间', roomName, 'lab数量不足');
    }
}
//中心爬
function creepCenter(room, roomName) {
    var f = room.energyAvailable < room.energyCapacityAvailable
    // if(roomName == 'W5N8')console.log(f)
    var container0 = Memory.rooms[roomName]['energyContainer'][0]['id']
    var container1 = Memory.rooms[roomName]['energyContainer'][1]['id']
    var level = Memory.rooms[roomName]['level'];
    var f_spawning = false;
    if (Memory.rooms[roomName]['control_center']) {
        var creepName = roomName + '_center_6_control'
        var creep = Game.creeps[creepName]
        if (!creep) {
            var spawn,level = level
            if (level < 8) spawn = getSpawn(roomName)
            else {
                var pos = s_p(Memory.rooms[roomName]['build_BigCat'][8]['spawn'], roomName)
                var builds = pos.lookFor(LOOK_STRUCTURES)
                for (var build of builds) {
                    if (build.structureType == 'spawn') {
                        spawn = build
                        break;
                    }
                }
            }
            var storage = room.storage
            var terminal = room.terminal
            var body,dir
            if (spawn && !spawn.spawning) {
                if (storage && !terminal && level >= 5) {
                    body = creepbody([MOVE], [CARRY], room, 5)
                } else if (storage && terminal && level < 8) {
                    body = creepbody([MOVE], [CARRY], room, 21)
                } else body = creepbody([CARRY], [CARRY], room, 50)
                if(level < 8)dir = [TOP,BOTTOM]
                else dir = [TOP]
                if (spawn.spawnCreep(body, creepName, { memory: { no_pull: true, spawn: spawn.id }, directions: dir }) == OK) f_spawning = true
            }else{
                if(level == 8 && !spawn){
                    spawn = getSpawn(roomName)
                    if(spawn){
                        if (storage && !terminal && level < 8) {
                            body = creepbody([MOVE], [CARRY], room, 5)
                        } else if (storage && terminal) {
                            body = creepbody([MOVE], [CARRY], room, 41)
                        }
                        dir = [TOP,BOTTOM]
                        if (spawn.spawnCreep(body, creepName, { memory: { no_pull: true, spawn: spawn.id }, directions: dir }) == OK) f_spawning = true
                    }
                }
            }
        } else creepControlCenter(creep)
    }
    var link = Game.getObjectById(Memory.rooms[roomName]['centerEnergyLink'])
    if (container0) {
        var container0 = Game.getObjectById(container0)
        if(!container0)Memory.rooms[roomName]['energyContainer'][0]['id'] = s_p(Memory.rooms[roomName]['energyContainer'][0]['pos'],roomName).lookFor(LOOK_STRUCTURES)[0].id
        var creepName_1 = roomName + '_center_6'
        var creep_1 = Game.creeps[creepName_1];
        if (!creep_1) {
            var xy = s_xy(Memory.rooms[roomName]['center'])
            var pos = xy_p(xy[0], parseInt(xy[1]) - 2, roomName)
            var spawn = pos.findInRange(FIND_STRUCTURES, 0, { filter: s => s.structureType == 'spawn' })[0]
            if (spawn && !spawn.spawning) {
                var body
                if (level < 7) body = [CARRY, CARRY]
                else body = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY]
                if (spawn.spawnCreep(body, creepName_1, { memory: { no_pull: true, spawn: spawn.id }, directions: [6] }) == OK) f_spawning = true
            }
        } else creepEnergyCenter(creep_1, container0, link, f)
        if (level >= 7) {
            var creepName_3 = roomName + '_center_8'
            var creep_3 = Game.creeps[creepName_3];
            if (!creep_3) {
                var xy = s_xy(Memory.rooms[roomName]['center'])
                var pos = xy_p(xy[0], parseInt(xy[1]) + 2, roomName)
                var spawn = pos.findInRange(FIND_STRUCTURES, 0, { filter: s => s.structureType == 'spawn' })[0]
                if (spawn && !spawn.spawning) {
                    var body = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY]
                    if (spawn.spawnCreep(body, creepName_3, { memory: { no_pull: true, spawn: spawn.id }, directions: [8] }) == OK) f_spawning = true
                }
            } else creepEnergyCenter(creep_3, container0, link, f)
        } else if (level >= 3) {
            var creepName_3 = roomName + '_center_8'
            var creep_3 = Game.creeps[creepName_3];
            if (!creep_3) {
                var xy = s_xy(Memory.rooms[roomName]['center'])
                var pos = xy_p(xy[0], parseInt(xy[1]) - 2, roomName)
                var spawn = pos.findInRange(FIND_STRUCTURES, 0, { filter: s => s.structureType == 'spawn' })[0]
                if (spawn && !spawn.spawning) {
                    var body = [CARRY, CARRY, MOVE]
                    if (spawn.spawnCreep(body, creepName_3, { memory: {no_pull: true,spawn: spawn.id }, directions: [8] }) == OK) f_spawning = true
                }
            } else {
                if (roomName != creep_3.room.name) creep_3.moveTo(s_p('25/25', roomName))
                else {
                    var xy = s_xy(Memory.rooms[roomName]['center'])
                    if (!creep_3.pos.isEqualTo(xy[0] - 1, xy[1] + 1)) creep_3.moveTo(xy[0] - 1, xy[1] + 1)
                    else creepEnergyCenter(creep_3, container0, link, f)
                }
            }
        }
    }
    if (container1) {
        var container1 = Game.getObjectById(container1)
        if(!container1)Memory.rooms[roomName]['energyContainer'][1]['id'] = s_p(Memory.rooms[roomName]['energyContainer'][1]['pos'],roomName).lookFor(LOOK_STRUCTURES)[0].id
        var creepName_2 = roomName + '_center_4'
        var creep_2 = Game.creeps[creepName_2];
        if (!creep_2) {
            var xy = s_xy(Memory.rooms[roomName]['center'])
            var pos = xy_p(xy[0], parseInt(xy[1]) - 2, roomName)
            var spawn = pos.findInRange(FIND_STRUCTURES, 0, { filter: s => s.structureType == 'spawn' })[0]
            if (spawn && !spawn.spawning) {
                var body
                if (level < 7) body = [CARRY, CARRY]
                else body = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY]
                if (spawn.spawnCreep(body, creepName_2, { memory: { no_pull: true, spawn: spawn.id }, directions: [4] }) == OK) f_spawning = true
            }
        } else {
            if(creep_2.memory.spawn){
                spawn = Game.getObjectById(creep_2.memory.spawn)
                if(spawn){
                    if((creep_2.store[e] > 0 || spawn.store[e] > 100) && room.energyAvailable < room.energyCapacityAvailable - 200){
                        if(creep_2.store[e] == 0){
                            creep_2.withdraw(spawn,e)
                        }else creep_2.transfer(creep_2.pos.findInRange(FIND_STRUCTURES,1,{filter:s=>s.structureType == 'extension' && s.store.getFreeCapacity(e) > 0})[0],e)
                        return
                    }
                }
            }else
            if(level <= 3){
                creep_2.memory.spawn = pos.findInRange(FIND_STRUCTURES, 0, { filter: s => s.structureType == 'spawn' })[0].id
            }
            creepEnergyCenter(creep_2, container1, link, f)
        }
        if (level >= 7) {
            var creepName_4 = roomName + '_center_2'
            var creep_4 = Game.creeps[creepName_4];
            if (!creep_4) {
                var xy = s_xy(Memory.rooms[roomName]['center'])
                var pos = xy_p(xy[0], parseInt(xy[1]) + 2, roomName)
                var spawn = pos.findInRange(FIND_STRUCTURES, 0, { filter: s => s.structureType == 'spawn' })[0]
                if (spawn && !spawn.spawning) {
                    var body = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY]
                    if (spawn.spawnCreep(body, creepName_4, { memory: { no_pull: true, spawn: spawn.id }, directions: [2] }) == OK) f_spawning = true
                }
            } else creepEnergyCenter(creep_4, container1, link, f)
        } else if (level >= 4) {
            var creepName_4 = roomName + '_center_2'
            var creep_4 = Game.creeps[creepName_4];
            if (!creep_4) {
                var xy = s_xy(Memory.rooms[roomName]['center'])
                var pos = xy_p(xy[0], parseInt(xy[1]) - 2, roomName)
                var spawn = pos.findInRange(FIND_STRUCTURES, 0, { filter: s => s.structureType == 'spawn' })[0]
                if (spawn && !spawn.spawning) {
                    var body = [CARRY, CARRY, MOVE]
                    if (spawn.spawnCreep(body, creepName_4, { memory: {no_pull: true, spawn: spawn.id }, directions: [2] }) == OK) f_spawning = true
                }
            } else {
                if (roomName != creep_4.room.name) creep_4.moveTo(s_p('25/25', roomName))
                else {
                    var xy = s_xy(Memory.rooms[roomName]['center'])
                    if (!creep_4.pos.isEqualTo(xy[0] + 1, xy[1] + 1)) creep_4.moveTo(xy[0] + 1, xy[1] + 1)
                    else creepEnergyCenter(creep_4, container1, link, f)
                }
            }
        }
    }
    return f_spawning
}
//主控中心
function creepControlCenter(creep) {
    if(!creep.memory.drop){
        var d = creep.pos.lookFor(LOOK_RESOURCES)[0]
        if(d){
            if(creep.pickup(d) == OK){
                creep.memory.drop = true
                return
            }
        }
    }
    var room = creep.room
    var roomName = room.name
    var level = Memory.rooms[roomName]['level']
    //renewCreep
    if (creep.getActiveBodyparts(MOVE) == 0) {
        if(creep.store.getUsedCapacity() == 0){
            if (creep.ticksToLive < 1450) creep.healLive();
        }
    }
    //move 
    else if (Memory.rooms[roomName]['controlCenter']) {
        var xy = s_xy(Memory.rooms[roomName]['controlCenter'])
        if (!creep.pos.isEqualTo(xy[0], xy[1])){
            var move_f = creep.moveTo(xy[0], xy[1])
            if(move_f == ERR_NO_PATH){
                if(room.energyCapacityAvailable == 12900)return creep.dead()
            }
        }
    }
    var storage = room.storage
    var terminal = room.terminal
    if(terminal){
        var terminal_cd = terminal.cooldown
    }
    //炮台
    var tower = Game.getObjectById(creep.memory.tower)
    if(!tower){
        tower = creep.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == 'tower' })[0]
        if (tower) creep.memory.tower = tower.id
    }
    //link
    var link = Game.getObjectById(creep.memory.link)
    if (!link) {
        link = creep.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == 'link' })[0]
        if (link) creep.memory.link = link.id
    }
    //工厂
    var factory = null
    if (level >= 7) {
        factory = Game.getObjectById(creep.memory.factory)
        if (!factory) {
            factory = room.find(FIND_STRUCTURES, { filter: s => s.structureType == 'factory' })[0]
            if (factory) creep.memory.factory = factory.id
        }
    }
    //powerSpawn工作(开启骚抛瓦的话没抛瓦会自动关闭)
    if(level == 8){
        var ps = Game.getObjectById(creep.memory.powerSpawn)
        if(ps){
            if(Memory.rooms[roomName]['openPowerSpawnWork']){
                if (ps && storage.store[e] > 200000 && ps.store[p] > 0 && ps.store[e] >= 50) ps.processPower();
                if(storage.store[p] + terminal.store[p] + creep.store[p] + ps.store[p] == 0)Memory.rooms[roomName]['openPowerSpawnWork'] = false
            }
        }
    }
    var creep_type = Object.keys(creep.store)[0]
    var creep_cap = creep.store.getCapacity();
    if (link && link.store[e] > 0 && creep.store.getUsedCapacity() == 0) return creep.withdraw(link, e)
    //spawn
    var spawn = Game.getObjectById(creep.memory.spawn)
    if (spawn && spawn.store[e] < 300 && (storage.store[e] > 0 || creep.store[e] > 0)) {
        if (!adjust(creep, creep_type, storage, spawn, e, 0)) return
    }
    if(tower && tower.store[e] < 500){
        if(creep.store.getUsedCapacity() == 0)return creep.withdraw(storage,e,500)
        else if(creep.store[e] > 0)return creep.transfer(tower, e)
    } 
    //other
    if (storage && terminal) {
        var storage_haveEnergy = storage.store[e]
        //平衡终端能量
        if (terminal.store[e] != centerConfig.terminal_energy) {
            if (terminal.store[e] > centerConfig.terminal_energy && storage.store.getFreeCapacity() > terminal.store[e] - centerConfig.terminal_energy) {
                var amount = Math.min(terminal.store[e] - centerConfig.terminal_energy, creep_cap)
                if (!adjust(creep, creep_type, terminal, storage, e, amount)) return
            }
            if (terminal.store[e] < centerConfig.terminal_energy && storage_haveEnergy + creep.store[e] >= centerConfig.terminal_energy - terminal.store[e]) {
                var amount = Math.min(centerConfig.terminal_energy - terminal.store[e], creep_cap)
                if (!adjust(creep, creep_type, storage, terminal, e, amount)) return
            }
        }
        //工厂任务
        if(level >= 7 && factory){
            //能量
            if (factory.store[e] < 2000 && storage_haveEnergy > 5000) {
                if (!adjust(creep, creep_type, storage, factory, e, 0)) return
            }
            //任务
            //完成后取出
            if(Memory.rooms[roomName]['factory']['finish']){
                var type = Memory.rooms[roomName]['factory']['to_type']
                if(factory.store[type] > 0){
                    var amount = Math.min(creep_cap,factory.store[type])
                    if (!adjust(creep, creep_type, factory, storage, type, amount)) return
                }
                var factory_type = Object.keys(factory.store)[1]
                if(factory_type){
                    var amount = Math.min(creep_cap,factory.store[factory_type])
                    if (!adjust(creep, creep_type, factory, storage, factory_type, amount)) return
                }else{
                    jumpToRoom(roomName,0,'工厂任务完成')
                    Memory.rooms[roomName]['factory']['finish'] = false
                    Memory.rooms[roomName]['factory']['fill'] = false
                    Memory.rooms[roomName]['factory']['on-off'] = false
                    Memory.rooms[roomName]['factory']['from_type'] = null
                    Memory.rooms[roomName]['factory']['from_amount'] = 0
                    Memory.rooms[roomName]['factory']['to_type'] = null
                }
            }
            //填充
            if(Memory.rooms[roomName]['factory']['fill'] && !Memory.rooms[roomName]['factory']['on-off'] && !Memory.rooms[roomName]['factory']['finish']){
                var types = Memory.rooms[roomName]['factory']['from_type']
                var amounts = Memory.rooms[roomName]['factory']['from_amount']
                var f = true;//默认填满
                for(var i = 0;i<types.length;i++){
                    if(factory.store[types[i]] < amounts[i]){
                        f = false
                        var amount = Math.min(amounts[i] - factory.store[types[i]],creep_cap);
                        var w = storage
                        if(storage.store[types[i]] == 0)w = terminal
                        if (!adjust(creep, creep_type, w, factory, types[i], Math.min(amount,w.store[types[i]]))) return
                    }
                }
                if(f){
                    Memory.rooms[roomName]['factory']['fill'] = false
                    Memory.rooms[roomName]['factory']['on-off'] = true
                }
            }
        }
        //填powerSpawn
        if (level == 8) {
            //powerSpawn
            if (!ps) {
                ps = creep.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == 'powerSpawn' })[0]
                if (ps) creep.memory.powerSpawn = ps.id
            } else {
                if (ps.store.getFreeCapacity(e) >= creep_cap && (storage_haveEnergy > 0 || creep.store[e] > 0)) {
                    if (!adjust(creep, creep_type, storage, ps, e, 0)) return
                }
                if (Memory.rooms[roomName]['openPowerSpawnWork'] && ps.store[p] == 0 && (terminal.store[p] > 0 || storage.store[p] > 0 || creep.store[p] > 0)) {
                    var w = storage
                    if (storage.store[p] == 0) w = terminal
                    if (!adjust(creep, creep_type, w, ps, p, 0)) return
                }
            }
        }
        //平衡原矿/bar/t0123
        for(var i = 0;i<7;i++){

            var type_o = centerConfig.ore[i]
            var ts_o = terminal.store[type_o]
            var ss_o = storage.store[type_o]
            
            var type_b = centerConfig.bar[i]
            var ts_b = terminal.store[type_b]
            var ss_b = storage.store[type_b]

            if (ts_o > centerConfig.terminal_other && storage.store.getFreeCapacity() > ts_o - centerConfig.terminal_other) {
                var amount = Math.min(ts_o - centerConfig.terminal_other, creep_cap)
                if (!adjust(creep, creep_type, terminal, storage, type_o, amount)) return
            }
            if (ts_o < centerConfig.terminal_other) {
                
                var need = centerConfig.terminal_other - ts_o
                if (ss_o >= need || creep.store[type_o] > 0) {
                    var amount = Math.min(need, creep_cap)
                    if (!adjust(creep, creep_type, storage, terminal, type_o, amount)) return
                }
                if(ss_o < need){
                    var amount = Math.ceil(need / 500)*100
                    if(ss_b + ts_b >= amount){
                        if(!factoryWorkF(roomName)){
                            jumpToRoom(roomName,0,'工厂添加任务:解压'+amount+type_b)
                            Memory.rooms[roomName]['factory']['fill'] = true
                            Memory.rooms[roomName]['factory']['from_type'] = [type_b]
                            Memory.rooms[roomName]['factory']['from_amount'] = [amount]
                            Memory.rooms[roomName]['factory']['to_type'] = type_o
                        }
                    }else{
                        if(Memory.rooms[roomName]['factory']['to_type'] != type_o){
                            if(!dealHelpResource(roomName,type_b,1000)){
                                if(!dealHelpResource(roomName,type_o,need)){
                                    //调节原矿(自动购买所有原矿)
                                    if((need + ss_o + creep.store[type_o] + creep.store[type_b]) < 3000 && terminal_cd == 0 && Memory.rooms[roomName]['factory']['to_type'] != type_o){
                                        var amount = 6000 - (need + ss_o)
                                        if(dealBuy(roomName,type_o,amount) == OK){
                                            jumpToRoom(roomName,0,'购买'+amount+' '+type_o)
                                            terminal_cd = 10;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
            }
            
            if (ts_b > centerConfig.terminal_other && storage.store.getFreeCapacity() > ts_b - centerConfig.terminal_other) {
                var amount = Math.min(ts_b - centerConfig.terminal_other, creep_cap)
                if (!adjust(creep, creep_type, terminal, storage, type_b, amount)) return
            }
            if (ts_b < centerConfig.terminal_other) {
                
                var need = centerConfig.terminal_other - ts_b
                if (ss_b >= need || creep_type == type_b) {
                    var amount = Math.min(need, creep_cap)
                    if (!adjust(creep, creep_type, storage, terminal, type_b, amount)) return
                }
            }
            
            if(storage.store[type_o] < 3000 && (storage.store[type_b] > 100 || ts_b > 100) && !factoryWorkF(roomName)){
                var amount = Math.min(Math.floor(Math.max(storage.store[type_b],ts_b) / 100) * 100 , 600)
                jumpToRoom(roomName,0,'工厂添加任务:解压'+amount+bar[type_b])
                Memory.rooms[roomName]['factory']['fill'] = true
                Memory.rooms[roomName]['factory']['from_type'] = [type_b]
                Memory.rooms[roomName]['factory']['from_amount'] = [amount]
                Memory.rooms[roomName]['factory']['to_type'] = type_o
            }
            
            //t0123
            if(Game.time % 10 <= 4){
                //t0
                var t0 = centerConfig.t0[i]
                if(t0 && !labT123(t0,roomName,creep,creep_type,storage,terminal))return
                //t1
                var t1 = centerConfig.t1[i]
                if(t1 && !labT123(t1,roomName,creep,creep_type,storage,terminal))return
                //t2
                var t2 = centerConfig.t2[i]
                if(t2 && !labT123(t2,roomName,creep,creep_type,storage,terminal))return
                //t3
                var t3 = centerConfig.t3[i]
                if(t3 && !labT123(t3,roomName,creep,creep_type,storage,terminal))return
            }

        }
        //nuker
        if(level == 8){
            //nuker
            var nuker = Game.getObjectById(creep.memory.nuker)
            if (nuker) {
                if (nuker.store[e] < 300000 && (storage_haveEnergy > 100000 || storage_haveEnergy + creep.store[e] > 100000)) {
                    if (!adjust(creep, creep_type, storage, nuker, e, 0)) return
                }
                if (nuker.store['G'] < 5000 && (terminal.store['G'] + storage.store['G'] >= 3000 || creep.store['G'] > 0)) {
                    var w = storage
                    if (storage.store['G'] == 0) w = terminal
                    var amount = Math.min(Math.min(w.store['G'],nuker.store.getFreeCapacity('G')),creep_cap)
                    if (!adjust(creep, creep_type, w, nuker, 'G', amount)) return
                }
            } else if(Game.time % 100 == 0){
                nuker = creep.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == 'nuker' })[0]
                if (nuker) creep.memory.nuker = nuker.id
            }
        }
    }
    //平衡终端抛瓦
    if (storage.store[p] > 0 || creep_type == p) {
        if (terminal.store[p] > centerConfig.terminal_other && storage.store.getFreeCapacity() > terminal.store[p] - centerConfig.terminal_other) {
            var amount = Math.min(terminal.store[p] - centerConfig.terminal_other, creep_cap)
            if (!adjust(creep, creep_type, terminal, storage, p, amount)) return
        }
        if (terminal.store[p] < centerConfig.terminal_other && (storage.store[p] > 0 || creep.store[p] > 0)) {
            var amount = Math.min(Math.min(centerConfig.terminal_other - terminal.store[p], creep_cap),storage.store[p])
            if (!adjust(creep, creep_type, storage, terminal, p, amount)) return
        }
    }
    if (storage && creep.store.getUsedCapacity() > 0) creep.transfer(storage, creep_type)
}
//能量中心
function creepEnergyCenter(creep, container, link, f) {
    if (creep.getActiveBodyparts(MOVE) == 0) {
        if(creep.getActiveBodyparts(CARRY) == 2 && creep.room.controller.level > 6) creep.suicide()
        if (!creep.memory.live && creep.ticksToLive < 1000) creep.memory.live = true
        if (creep.memory.live && creep.ticksToLive > 1400) creep.memory.live = false
        if (creep.memory.live) creep.healLive();
    }
    if (!f) {
        if(container){
            if(link){
                if(container.store[e] > 1800){
                    if(creep.store.getFreeCapacity() > 0 && link.store[e] > 0){
                        creep.withdraw(link,e)
                    }
                }else{
                    if(creep.store[e] > 0){
                        creep.transfer(container,e)
                    }else if(link.store[e] > 0){
                        creep.withdraw(link,e)
                    }
                }
            }else if (container.store[e] > 0 && creep.store.getFreeCapacity() > 0) creep.withdraw(container, e)
        }
    } else {
        if(!creep.memory.builds || Game.time % 2 == 0){
            creep.memory.builds = []
            let i = 0;
            creep.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN}).forEach(t =>{
                creep.memory.builds[i] = t.id
                i++
            })
        }
        if(creep.memory.builds.length > 0){
            var target = Game.getObjectById(creep.memory.build)
            if (target && target.store.getFreeCapacity(e) > 0) {
                if (creep.store[e] < 50) {
                    if (link && link.store[e] > 0) creep.withdraw(link, e)
                    else if (container && container.store[e] > 0) creep.withdraw(container, e)
                } else creep.transfer(target, e)
            }else{
                for(let build of creep.memory.builds){
                    target = Game.getObjectById(build)
                    if(target && target.store.getFreeCapacity(e) > 0){
                        creep.memory.build = build
                        break
                    }
                }
            }

        }
    }
}
//挖能量爬
function creepHarvest(creep, roomName) {
    // creep.say('harvest')
    if(creep.next())return
    if(creep.memory.no_move && creep.getActiveBodyparts(WORK)> 10 && Game.time % 2 && creep.room.terminal)return
    if(creep.memory.deadF)return creep.suicide()
    if(Game.time % 10 == 0 && !creep.memory.deadF){
        var test = Object.values(Memory.rooms[roomName]['creeps']['work_source']['name']).indexOf(creep.name)
        if (test >= Memory.rooms[roomName]['creeps']['work_source']['num'])return creep.memory.deadF = true
    }
    if (!creep.memory.no_move && !creep.memory.source) {
        if (!Memory.rooms[roomName]['sources'][1]) {
            creep.memory.source = Game.getObjectById(Memory.rooms[roomName]['sources'][0]['id'])
        } else {
            var s1 = Game.getObjectById(Memory.rooms[roomName]['sources'][0]['id'])
            var s2 = Game.getObjectById(Memory.rooms[roomName]['sources'][1]['id'])
            var s1_c = s1.pos.findInRange(FIND_MY_CREEPS, 1, { filter: c => c.memory.workType && c.memory.workType.split('/')[2] == 'source' }).length
            var s2_c = s2.pos.findInRange(FIND_MY_CREEPS, 1, { filter: c => c.memory.workType && c.memory.workType.split('/')[2] == 'source' }).length
            if (s2_c == Memory.rooms[roomName]['sources'][1]['counter']) {
                creep.memory.source = s1.id
            } else if (s1_c == Memory.rooms[roomName]['sources'][0]['counter']) {
                creep.memory.source = s2.id
            } else {
                if (s1_c > s2_c || s1_c == 3) {
                    creep.memory.source = s2.id
                } else {
                    creep.memory.source = s1.id
                }
            }
        }
    }
    if (creep.memory.source) {
        var source = Game.getObjectById(creep.memory.source)
        if (!source) return creep.memory.source = null;
        var level = Memory.rooms[roomName]['level']
        if(!creep.memory.no_move && !creep.pos.isNearTo(source)){
            if (creep.getActiveBodyparts(CARRY) > 0) {
                var container = Game.getObjectById(creep.memory.container)
                if (!container) {
                    container = source.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == STRUCTURE_CONTAINER })[0]
                    if (container) creep.memory.container = container.id
                }
                if (container) {
                    if(creep.pos.isEqualTo(container)){
                        creep.memory.no_move = true
                        if (container.hits < 250000 && creep.store.getUsedCapacity() > 0) return creep.repair(container)
                        if (creep.store.getFreeCapacity() > 20 && container.store[e] > 0) creep.withdraw(container, e)
                    }else if (level >= 3){
                        if(container.pos.lookFor(LOOK_CREEPS).length > 0){
                            if(creep.memory.source == Memory.rooms[roomName]['sources'][0]['id']){
                                creep.memory.source = Memory.rooms[roomName]['sources'][1]['id']
                            }else creep.memory.source = Memory.rooms[roomName]['sources'][0]['id']
                            creep.say('换一个好了')
                            creep.memory.container = null
                            creep.memory.no_move = false
                            if(creep.store[e] > 0)creep.drop(e)
                        }else{
                            var f = creep.moveTo(container)
                            if(f == OK)return
                            if(f == ERR_NO_PATH){
                                creep.say('找不到路重新寻找能量')
                                if(creep.memory.source == Memory.rooms[roomName]['sources'][0]['id']){
                                    creep.memory.source = Memory.rooms[roomName]['sources'][1]['id']
                                }else creep.memory.source = Memory.rooms[roomName]['sources'][0]['id']
                                creep.memory.container = null
                                creep.memory.no_move = false
                                if(creep.store[e] > 0)creep.drop(e)
                            }
                        }
                    }
                    
                }
            }
            var f = creep.moveTo(source)
            if (f == ERR_NO_PATH) {
                creep.say('找不到路重新寻找能量')
                if(creep.memory.source == Memory.rooms[roomName]['sources'][0]['id']){
                    creep.memory.source = Memory.rooms[roomName]['sources'][1]['id']
                }else creep.memory.source = Memory.rooms[roomName]['sources'][0]['id']
                creep.memory.container = null
                if(creep.store[e] > 0)creep.drop(e)
            }
            return
        }
        
        var room = Game.rooms[roomName]
        if (creep.getActiveBodyparts(CARRY) > 0) {
            var container = Game.getObjectById(creep.memory.container)
            if (!container) {
                container = source.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == STRUCTURE_CONTAINER })[0]
                if (container) creep.memory.container = container.id
                else{
                    var site = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0]
                    if(site){
                        if(creep.store[e] >= creep.getActiveBodyparts(WORK) * 5)return creep.build(site)
                    }
                }
            }
            if (container) {
                if (level >= 3 && !creep.pos.isEqualTo(container)){
                    var f = creep.moveTo(container)
                    if(f == ERR_NO_PATH){
                        creep.say('找不到路重新寻找能量')
                        if(creep.memory.source == Memory.rooms[roomName]['sources'][0]['id']){
                            creep.memory.source = Memory.rooms[roomName]['sources'][1]['id']
                        }else creep.memory.source = Memory.rooms[roomName]['sources'][0]['id']
                        creep.memory.container = null
                        creep.memory.no_move = false
                    }
                    return
                }
                if (container.hits < 250000 && creep.store.getUsedCapacity() > 0) return creep.repair(container)
                if (creep.store.getFreeCapacity() > 20 && container.store[e] > 0) creep.withdraw(container, e)
            }
        }
        if(level >= 3 && !creep.memory.no_move){
            if(container && creep.pos.isEqualTo(container))creep.memory.no_move = true
        }
        if ((container && container.store.getFreeCapacity() > 0) || creep.store.getFreeCapacity() > 0 || creep.getActiveBodyparts(CARRY) == 0 || level <= 2) {
            if(creep.harvestHomeEnergy(source, container) == -1)return
        }
        
        if(level >= 6 && creep.room.terminal){
            var rampart = Game.getObjectById(creep.memory.rampart)
            if(!rampart){
                var site = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0]
                if(site && creep.store[e] > 0)return creep.build(site)
                var builds = creep.pos.lookFor(LOOK_STRUCTURES)
                var f = false
                for(var build of builds){
                    if(build.structureType == 'rampart'){
                        f = true
                        creep.memory.rampart = build.id
                        break
                    }
                }
                if(!f && builds.length > 0)creep.pos.createConstructionSite('rampart')
            }else{
                if(creep.store[e] > 10){
                    if(rampart.hits < 1000000 && Game.time % 3){
                        return creep.repair(rampart)
                    }
                    if(rampart.hits < 250000000 && Game.time % 7 == 0)return creep.repair(rampart)
                }
            }
        }
        if (creep.store[e] > 40 && ((level == 4 && room.energyCapacityAvailable < 1300) || (level == 5 && room.energyCapacityAvailable < 1900))) {
            var site = Game.getObjectById(creep.memory.site)
            if (!site) {
                site = creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 1)[0]
                if (site) creep.memory.site = site.id
            }
            if (site) return creep.build(site)
        }
        if (level >= 4 && room.energyAvailable < room.energyCapacityAvailable) {
            if (creep.store[e] >= 50) {
                var target = creep.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == STRUCTURE_EXTENSION && s.store.getFreeCapacity(e) > 0 })[0]
                if (target) return creep.transfer(target, e)
            }
        }
        
        if (level >= 5) {
            if (!creep.memory.link) {
                var link = creep.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == STRUCTURE_LINK })[0]
                if (link) creep.memory.link = link.id
            } else {
                var link = Game.getObjectById(creep.memory.link)
                if (!link) creep.memory.link = null
                else if (creep.store[e] >= 50){
                    if(creep.transfer(link, e) != OK){
                        creep.memory.link = null
                    }
                }
            }
        }
        
        
    }
    
}
//搬运爬
function creepCarry(creep, roomName) {
    if(creep.next())return 
    if(creep.memory.deadF)return creep.dead()
    if(Game.time % 10 == 0 && !creep.memory.deadF){
        var test = Object.values(Memory.rooms[roomName]['creeps']['work_carry']['name']).indexOf(creep.name)
        if (test >= Memory.rooms[roomName]['creeps']['work_carry']['num'])return creep.memory.deadF = true
    }
    var room = creep.room
    var level = Memory.rooms[roomName]['level']
    if (level <= 3 && Game.time % 10 == 0) {
        if (creep.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType == 'spawn' }).length > 0){
            creep.moveTo(room.controller)
            creep.memory.no_pull = true
            return
        }
    }
    if (level > 2 && creep.getActiveBodyparts(CARRY) == 2) {
        if (((Memory.rooms[roomName]['level'] <= 4 && room.energyAvailable > 750) || (Memory.rooms[roomName]['level'] > 4 && room.energyAvailable > 1500)) && creep.dead()) return
    }
    var storage = room.storage
    var creep_type = Object.keys(creep.store)[0]
    if (storage && creep.store.getUsedCapacity() > 0 && creep_type != 'energy') {
        if (creep.transfer(storage, creep_type) == nir) creep.moveTo(storage)
        return
    }
    var en = room.energyAvailable, enm = room.energyCapacityAvailable
    if (en == enm && level <= 6 && storage && storage.store[e] > 0) {
        if(!creep.memory.container){
            if (Memory.rooms[roomName]['energyContainer'][0]['id']) {
                var c1 = Game.getObjectById(Memory.rooms[roomName]['energyContainer'][0]['id'])
                if(c1 && c1.store[e] < 1500){
                    creep.memory.container = c1.id
                }
            }
        }
        if(!creep.memory.container){
            if (Memory.rooms[roomName]['energyContainer'][1]['id']) {
                var c2 = Game.getObjectById(Memory.rooms[roomName]['energyContainer'][1]['id'])
                if(c2 && c2.store[e] < 1500){
                    creep.memory.container = c2.id
                }
            }
        }
        if(creep.memory.container){
            var container = Game.getObjectById(creep.memory.container)
            if(!container || container.store.getFreeCapacity() < 100){
                creep.memory.container = null
            }else{
                if (creep.store[e] > 0) {
                    if (creep.transfer(container, e) == nir) creep.moveTo(container)
                } else if (creep.withdraw(storage, e) == nir) creep.moveTo(storage)
            }
            return creep.say('-> 容器')
        }
    }
    if (creep.store.getFreeCapacity() > creep.store.getCapacity() * 0.8) {
        if(storage && creep.getActiveBodyparts(CARRY) == 2 && storage.store[e] > 2000){
            if(creep.withdraw(storage,e) == nir)return creep.moveTo(storage)
        }
        if (Memory.rooms[roomName]['state'] == 'd' || Game.time % 10 == 0 || creep.memory.tom) {
            if (!creep.memory.tom && Game.time % 10 == 0) {
                var tom = creep.pos.findClosestByRange(FIND_TOMBSTONES, { filter: t => t.store.getUsedCapacity() > 200})
                if (tom) creep.memory.tom = tom.id
                else creep.memory.tom = null
            } 
            if (creep.memory.tom) {
                var tom = Game.getObjectById(creep.memory.tom)
                if (tom) {
                    if (tom.store.getUsedCapacity() > 0) {
                        var tom_last = Object.keys(tom.store)[0]
                        if (creep.withdraw(tom, tom_last) == nir) return creep.moveTo(tom)
                    } else creep.memory.tom = null
                }else creep.memory.tom = null
            }
        }
        if(level >= 6){
            if(Memory.rooms[roomName]['rubbish']['id']){
                var container = Game.getObjectById(Memory.rooms[roomName]['rubbish']['id'])
                if(container){
                    var container_res = Object.keys(container.store)[0]
                    if(container_res){
                        if(creep.withdraw(container,container_res) == nir)creep.moveTo(container)
                    }
                }else creep.memory.rubbish = null
            }else if(Game.time % 20 == 0){
                var s = Memory.rooms[roomName]['rubbish']['pos']
                s_p(s,roomName).lookFor(LOOK_STRUCTURES).forEach(s=>{
                    if(s.structureType == 'container'){
                        Memory.rooms[roomName]['rubbish']['id'] = s.id
                    }
                })
            }
        }
        if((level == 8 && en > 12800) || ((level == 7 && en > 5500)))return creep.memory.no_pull = false
        creep.carryHome(roomName)
    } else {
        if(storage && creep.getActiveBodyparts(CARRY) == 2 && level > 5){
            var target = Game.getObjectById(creep.memory.e)
            if(!target || target.store.getFreeCapacity(e) == 0){
                var target = creep.pos.findClosestByPath(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_EXTENSION && s.store.getFreeCapacity(e) > 0 })
                if(target)creep.memory.e = target.id
            }
            if(target){
                if(creep.transfer(target,e) == nir)creep.moveTo(target)
            }else creep.memory.e = null
            return
        }
        
        var target = Game.getObjectById(creep.memory.e);
        if (!target || target.store.getFreeCapacity(e) < 10) {
            var id = null;
            if (Memory.rooms[roomName]['state'] == 'd' || (level < 5 && Game.time % 3 == 0) || Game.time % 11 == 0) {
                target = creep.pos.findClosestByRange(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_TOWER && s.store.getFreeCapacity(e) > 200 })
                if (target) id = target.id
            }
            if (!id) {
                if((level == 8 && en > 12800) || ((level == 7 && en > 5500)))return creep.memory.no_pull = false
                if ((en < enm && enm < 12900) || (en < 12600 && enm == 12900)) {
                    if (level <= 3) target = creep.pos.findClosestByPath(FIND_STRUCTURES, {ignoreCreeps : false,filter: s => (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION) && s.store.getFreeCapacity(e) > 0 })
                    else target = creep.pos.findClosestByPath(FIND_STRUCTURES, {ignoreCreeps : false,filter: s => s.structureType == STRUCTURE_EXTENSION && sp_distance(Memory.rooms[roomName]['center'], s.pos) > 2 && s.store.getFreeCapacity(e) > 0 })
                    if (target) id = target.id
                }
                if (!id) {
                    if (!c1 && Memory.rooms[roomName]['energyContainer'][0]['id']) var c1 = Game.getObjectById(Memory.rooms[roomName]['energyContainer'][0]['id'])
                    if (!c2 && Memory.rooms[roomName]['energyContainer'][1]['id']) var c2 = Game.getObjectById(Memory.rooms[roomName]['energyContainer'][1]['id'])
                    if (c1 && !c2 && c1.store[e] < 1500) id = c1.id
                    else if (!c1 && c2 && c2.store[e] < 1500) id = c2.id
                    else if (c1 && c2) {
                        if (c1.store[e] > c2.store[e] && c2.store[e] < 1500) id = c2.id
                        else if (c1.store[e] < c2.store[e] && c1.store[e] < 1500) id = c1.id
                        else if (c1.store[e] < 100) id = c1.id
                    }
                }
            }
            if (!id && (level < 4 || !storage)) {
                target = creep.pos.findClosestByRange(FIND_MY_CREEPS, { filter: c => c.memory.workType && c.memory.workType.split('/')[2] != 'harvester' && c.getActiveBodyparts(WORK) > 0 && c.store.getFreeCapacity() > 25 })
                if (target) id = target.id
            }
            if (!id && level >= 6) {
                target = creep.pos.findClosestByPath(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_LAB && s.store.getFreeCapacity(e) > 0 })
                if (target) id = target.id
            }
            if (id) {
                target = Game.getObjectById(id)
                if(target){
                    creep.memory.e = id
                }else creep.memory.e = null;
            }else creep.memory.e = null;
        }
        // creep.say('寻找carry目标')
        if (target) {
            var f = creep.transfer(target, e)
            if (f == OK) {
                if (!creep.memory.no_pull) creep.memory.no_pull = true
            } else if (f == nir) {
                if (creep.moveTo(target) == ERR_NO_PATH) creep.memory.e = null
                if (creep.memory.no_pull) creep.memory.no_pull = false
                new RoomVisual(roomName).line(creep.pos, target.pos, { color: 'white', opacity: 0.2 })
            } else creep.memory.e = null;
        } else {
            if (storage) {
                if (creep.transfer(storage, e) == nir) creep.moveTo(storage)
                creep.say('-> storage')
            }
        }
    }
}
//升级爬
function creepUp(creep, roomName) {
    if(creep.memory.deadF || (creep.getActiveBodyparts(WORK) > 1 && Memory.rooms[roomName]['oneWorkCreepUp']) || (Memory.rooms[roomName]['level'] > 2 && creep.getActiveBodyparts(WORK) == 1 && !Memory.rooms[roomName]['oneWorkCreepUp']))return creep.dead()
    if(Memory.rooms[roomName]['level'] == 8 || Memory.rooms[roomName]['state'] == 'd'){
        if (!creep.memory.up && creep.store.getFreeCapacity() == 0) creep.memory.up = true;
        if (creep.memory.up && creep.store.getUsedCapacity() == 0) creep.memory.up = false;
        if (!creep.memory.up){
            let storage = creep.room.storage
            if(creep.withdraw(storage,e) == nir)creep.moveTo(storage)
        }else creep.upController(creep.room.controller)
        return
    }
    if (Memory.rooms[roomName]['level'] <= 3 && Game.time % 10 == 0) {
        if (creep.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType == 'spawn' }).length > 0){
            creep.moveTo(creep.room.controller)
            creep.memory.no_pull = true
            return
        }
    }
    if(Game.time % 10 == 0 && !creep.memory.deadF){
        var test = Object.values(Memory.rooms[roomName]['creeps']['work_up']['name']).indexOf(creep.name)
        if (test >= Memory.rooms[roomName]['creeps']['work_up']['num'])return creep.memory.deadF = true
    }
    // creep.say('up')
    if (creep.store.getUsedCapacity() > 0 && Object.keys(creep.store)[0] != e) {
        var storage = creep.room.storage
        if(!creep.memory.no_pull)creep.memory.no_pull = true
        if (creep.transfer(storage, Object.keys(creep.store)[0]) == nir) return creep.moveTo(storage)
    }
    if (creep.memory.up && creep.store.getUsedCapacity() == 0){
        creep.memory.up = false;
        creep.memory.target = null;
    }
    if (!creep.memory.up && creep.store.getFreeCapacity() == 0) creep.memory.up = true;
    if (!creep.memory.up) creep.carryHome(roomName)
    else creep.upController(creep.room.controller)
}
//建造爬
function creepBuild(creep, roomName) {
    if (!Memory.rooms[roomName]['building']){
        if(!creep.memory.wallOK) creep.memory.wallOK = 'f';
        if(creep.memory.wallOK == 'f'){
            var wall = Game.getObjectById(creep.memory.wall)
            if(!wall || wall.hits > 20000){
                var walls = creep.room.find(FIND_STRUCTURES, { filter: w => (w.structureType == STRUCTURE_WALL || w.structureType == STRUCTURE_RAMPART) && w.hits < 20000})
                if(walls.length > 0){
                    var w = null
                    for(var wall of walls){
                        if(wall.hits < 20000){
                            w = wall
                            break
                        }
                    }
                    if(w)creep.memory.wall = w.id
                }else creep.memory.wallOK = 'n'
            }else{
                creep.say('build_wall')
                if(creep.repair(wall) == nir)creep.moveTo(wall)
            }
        }else return creep.dead()
        if(creep.store[e] > 0)return 
    }
    if(creep.transferStorage())return
    if (Game.time % 20 < 2) {
        if (creep.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType == 'spawn' }).length > 0){
            creep.moveTo(creep.room.controller)
            creep.memory.no_pull = true
            return
        }
    }
    if (creep.memory.build && creep.store.getUsedCapacity() == 0) creep.memory.build = false;
    if (!creep.memory.build && creep.store.getFreeCapacity() == 0) creep.memory.build = true;
    if (!creep.memory.build) creep.carryHome(roomName)
    else creep.buildHomeSite()
}
//前期维护爬
function creepRepair(creep, roomName) {
    if (Object.keys(Memory.rooms[roomName]['repair']).length == 0 && creep.dead())return
    creep.say('repair')
    if (creep.memory.repair && creep.store.getUsedCapacity() == 0) {
        creep.memory.repair = false;
        creep.memory.target = null;
    }
    if (!creep.memory.repair && creep.store.getFreeCapacity() == 0) creep.memory.repair = true;
    if (!creep.memory.repair) creep.carryHome(roomName)
    else {
        var v = new RoomVisual(roomName)
        for (var i in Memory.rooms[roomName]['repair']) {
            var repair = Game.getObjectById(Memory.rooms[roomName]['repair'][i])
            if (repair.hits < repair.hitsMax) {
                v.line(creep.pos, repair.pos, { color: 'yellow', opacity: 0.2 })
                if (creep.repair(repair) == nir) creep.moveTo(repair)
            } else delete Memory.rooms[roomName]['repair'][i]
            break
        }
    }
}
//挖矿爬
function creepMine(creep, roomName) {
    if (creep.store.getFreeCapacity() > 0) {
        var mineral = Game.getObjectById(Memory.rooms[roomName]['mineral']['id'])
        if(!mineral)return
        if (mineral.mineralAmount > 0) {
            var f = creep.harvest(mineral)
            if(f == OK){
                if (!creep.memory.no_pull) creep.memory.no_pull = true
            }else if (f == nir) {
                if (creep.memory.no_pull) creep.memory.no_pull = false
                creep.moveTo(mineral)
            }
        } else {
            if (Memory.rooms[roomName]['mineral']['tick'] < Game.time) Memory.rooms[roomName]['mineral']['tick'] = Game.time + mineral.ticksToRegeneration;
            if (creep.store.getUsedCapacity() > 0) {
                var storage = creep.room.storage
                if (storage) {
                    if (creep.memory.no_pull) creep.memory.no_pull = false
                    if (creep.transfer(storage, Memory.rooms[roomName]['mineral']['type']) == nir) creep.moveTo(storage)
                }
            } else creep.dead();
        }
    } else {
        var storage = creep.room.storage
        if (storage) {
            if (creep.memory.no_pull) creep.memory.no_pull = false
            if (creep.transfer(storage, Memory.rooms[roomName]['mineral']['type']) == nir) creep.moveTo(storage)
        }
    }
}
//刷墙爬
function creepWall(creep, roomName) {
    creep.say('wall')
    if (creep.store[e] > 0) {
        creep.repairHomeWall()
    } else {
        var storage = creep.room.storage
        if (storage && storage.store[e] > 5000){
            if(creep.withdraw(storage, e) == nir) creep.moveTo(storage)
        }else{
            var terminal = creep.room.terminal;
            if(terminal && terminal.store[e] > 1000){
                if(creep.withdraw(terminal, e) == nir) creep.moveTo(terminal)
            }else{
                creep.carryHome(creep.room.name)
            }
        }
    }
    if(Memory.rooms[roomName]['creeps']['work_wall']['num'] == 1)creep.memory.no_pull = false
}
//主防爬
function creepDefend(creep,roomName){
    creep.say('FUCK!!',true)
    var f = Memory.rooms[roomName]['work_defend']
    if(f['num'] == 0)return creep.dead();
    var room = Game.rooms[roomName]
    if(!creep.memory.enemy){
        creep.memory.enemy = room.findEnemys()[0].id
    }
    if(creep.memory.enemy){
        var enemy = Game.getObjectById(creep.memory.enemy)
        if(!enemy){
            creep.memory.enemy = room.findEnemys()[0].id
        }else{
            if(creep.attack(enemy) == nir)creep.moveTo(enemy)
        }
    }
}
//外矿
//外矿初始化爬
function creepOutInit(creep) {
    var roomName = creep.name.split('/')[0]
    creep.say('out_energy')
    if (Memory.rooms[roomName]['out_energy_ob']) return creep.suicide();
    if (!creep.memory.out) {
        var f = true;
        for (var outName in Memory.rooms[roomName]['out_energy']) {
            if (!Memory.rooms[roomName]['out_energy'][outName]['find']) {
                f = false;
                creep.memory.out = s_p('25/25', outName)
                break;
            }
        }
        if (f) Memory.rooms[roomName]['out_energy_ob'] = true
    } else {
        var outName = creep.memory.out.roomName
        if (creep.room.name != outName) {
            var pos = s_p(creep.memory.out.x + '/' + creep.memory.out.y, creep.memory.out.roomName)
            creep.moveTo(pos)
        } else {
            var room = Game.rooms[outName]
            var controller = room.controller
            if (!controller || controller.owner || controller.reservation) {
                delete Memory.rooms[roomName]['out_energy'][outName]
                creep.memory.out = null;
                return
            }
            Memory.rooms[roomName]['out_energy'][outName]['energy'] = {}
            Memory.rooms[roomName]['out_energy'][outName]['energy'][0] = {}
            Memory.rooms[roomName]['out_energy'][outName]['energy'][1] = {}
            var source_i = 0;
            room.find(FIND_SOURCES).forEach(source => {
                Memory.rooms[roomName]['out_energy'][outName]['energy'][source_i]['id'] = source.id
                Memory.rooms[roomName]['out_energy'][outName]['energy'][source_i]['container'] = null;
                Memory.rooms[roomName]['out_energy'][outName]['energy'][source_i]['road/s'] = null
                source_i++
            })
            Memory.rooms[roomName]['out_energy'][outName]['find'] = true
            Memory.rooms[roomName]['out_energy'][outName]['state'] = 's'
            creep.memory.out = false;
        }
    }
}
//外矿预定
function creepOutClaim(creep, outName) {
    if (creep.room.name != outName) {
        creep.say('cla:' + outName)
        var pos = s_p('25/25', outName)
        return creep.moveTo(pos,{swampCost : 1})
    } else {
        var controller = creep.room.controller
        var f = creep.reserveController(controller)
        if (f == nir) creep.moveTo(controller,{swampCost : 1})
        else if (f == -7) creep.attackController(controller)
    }
}
//外矿挖能量
function creepOutHarvest(creep, roomName, outName) {
    var f = Memory.rooms[roomName]['out_energy'][outName]
    if(!f || !f['energy'])return creep.dead();
    var energy = f['energy'][creep.name.split('/')[4]]
    var source = Game.getObjectById(energy.id)
    if(source){
        if(!creep.memory.sourcePos)creep.memory.sourcePos = source.pos.x + '/' + source.pos.y;
    }
    if (!source || creep.room.name != outName || pos_xy(creep.pos, 0)) {
        creep.say('har:' + outName)
        if(creep.memory.sourcePos){
            let sourcePos = s_p(creep.memory.sourcePos,outName)
            if(!creep.pos.isNearTo(sourcePos)){
                creep.moveTo(sourcePos,{swampCost:5,maxOps:5000})
                return
            }
        }
        creep.moveTo(s_p('25/25', outName),{swampCost:5,maxOps:5000})
    } else {
        if (f['state'] == 's' && (Game.time % 10 == 0  || creep.hits < creep.hitsMax - 100)) {
            if(creep.room.find(FIND_HOSTILE_STRUCTURES).length > 0)Memory.rooms[roomName]['out_energy'][outName]['state'] = 'd'
            else {
                var enemys = creep.room.findEnemys()
                var enemyCount = 0,npcCount = 0;
                for(var enemy of enemys){
                    if(enemy.owner.username == npc)npcCount++
                    if(enemy.getActiveBodyparts(ATTACK) > 0 || enemy.getActiveBodyparts(RANGED_ATTACK) > 0 || enemy.getActiveBodyparts(CLAIM) > 0){
                        enemyCount++
                    }
                }
                if(enemyCount > 0)Memory.rooms[roomName]['out_energy'][outName]['state'] = 'd'
            }
            
            if (creep.room.find(FIND_HOSTILE_STRUCTURES).length > 0 || creep.room.findEnemys().length > 0) Memory.rooms[roomName]['out_energy'][outName]['state'] = 'd'
        }
        
        if(creep.room.controller.reservation && creep.room.controller.reservation.username != Memory.playerName)return
        
        if (source && !creep.pos.isNearTo(source)){
            if(creep.memory.sourcePos){
                let sourcePos = s_p(creep.memory.sourcePos,outName)
                if(!creep.pos.isNearTo(sourcePos)){
                    creep.moveTo(sourcePos,{swampCost:5,maxOps:5000})
                    return
                }
            }
            if(!energy.container)return creep.moveTo(source)
        }
        if (energy.container) {
            var container = Game.getObjectById(energy.container)
            if (container) {
                if (!creep.pos.isEqualTo(container)) creep.moveTo(container)
                if (Game.time % ((creep.name.split('/')[4] + 1) * 5) == 0 && Object.keys(Game.constructionSites).length == 0) {
                    var storage = Game.rooms[roomName].storage
                    if (storage) {
                        if (!f['energy'][creep.name.split('/')[4]]['road/s']) {
                            Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['road/s'] = {}
                            var path = BG_outPath(storage.pos,creep.pos)
                            if(path.length > 70)Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['big'] = true
                            if(path.length > 40)Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['link'] = true
                            else Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['big'] = false
                            for (var i in path) {
                                var pos = path[i]
                                if(pos_xy(pos,0))continue
                                pos.createConstructionSite('road')
                                var s = p_s(pos) + '/' + pos.roomName
                                var lookType = pos.lookFor(LOOK_STRUCTURES)
                                if(lookType.length == 1){
                                    if(lookType[0].structureType != 'road')Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['road/s'][i] = s
                                }else{
                                    var f = false;//默认没路
                                    for(var i of lookType){
                                        if(i.structureType == 'road'){
                                            f = true
                                            break
                                        }
                                    }
                                    if(!f)Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['road/s'][i] = s
                                }
                            }
                        }
                    }
                }
                if (creep.store.getFreeCapacity() > 0 && container.store[e] > 0) creep.withdraw(container, e)
                if (container.hits < container.hitsMax && creep.store[e] > 0) creep.repair(container)
                if (source.energy > 0 && container.store.getFreeCapacity() > 0) creep.harvest(source)
            } else Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['container'] = null
        } else {
            var site = Game.getObjectById(creep.memory.site)
            if (!site) {
                site = creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, { filter: s => s.structureType == STRUCTURE_CONTAINER })[0]
                if (site) creep.memory.site = site.id
            }
            if (site) {
                if (creep.store[e] > 30) creep.build(site)
                else creep.harvest(source)
            } else {
                var container = creep.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType == STRUCTURE_CONTAINER })[0]
                if (container) Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['container'] = container.id
                else creep.pos.createConstructionSite(STRUCTURE_CONTAINER)
            }
        }
    }
}
//外矿搬运
function creepOutCarry(creep, roomName, outName) {
    var f = Memory.rooms[roomName]['out_energy'][outName]
    if(!f || !f['energy'])return creep.dead();
    if (creep.getActiveBodyparts(WORK) == 0 && Game.rooms[roomName].storage && creep.dead())return
    if(creep.memory.carry && creep.store.getUsedCapacity() < 600){
        creep.memory.carry = false
    }
    if(!creep.memory.carry && creep.store.getFreeCapacity() == 0){
        creep.memory.carry = true
    }
    if (!creep.memory.carry) {
        var thisd = creep.pos.lookFor(LOOK_RESOURCES)[0]
        if(thisd){
            return creep.pickup(thisd)
        }
        if (creep.room.name != outName || pos_xy(creep.pos, 0)) {
            if (Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['container']) {
                var container = Game.getObjectById(Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['container'])
                if (container) {
                    if (!creep.pos.isNearTo(container)) creep.moveTo(container, { reusePath: 20 })
                    else if (container.store[e] >= creep.getActiveBodyparts(CARRY) * 50) {
                        creep.withdraw(container, e)
                    }
                }
            } else creep.moveTo(s_p('25/25', outName), { reusePath: 20 })
            creep.say('car:' + outName)
        } else {
            if(creep.room.controller.reservation && creep.room.controller.reservation.username != Memory.playerName)return  
            var t = creep.pos.findInRange(FIND_TOMBSTONES, 3, { filter: t => t.store[e] >= creep.store.getFreeCapacity() })[0]
            if (t) {
                if (creep.withdraw(t, e) == nir) creep.moveTo(t)
            }
            var container = Game.getObjectById(Memory.rooms[roomName]['out_energy'][outName]['energy'][creep.name.split('/')[4]]['container'])
            if (container) {
                if (!creep.pos.isNearTo(container)) creep.moveTo(container, { reusePath: 20 })
                else if (container.store[e] >= creep.getActiveBodyparts(CARRY) * 50) {
                    creep.withdraw(container, e)
                }
            } else creep.say('> <')
        }
    } else {
        var room = creep.room
        //build/repair
        if (creep.getActiveBodyparts(WORK) >= 2 && creep.room.name != roomName && !pos_xy(creep.pos, 0)) {
            if(creep.memory.site || Game.time % 10 == 0){
                var site = Game.getObjectById(creep.memory.site)
                if(!site){
                    var site = creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES)
                    if(site)creep.memory.site = site.id
                    else creep.memory.site = null
                }
                if (site) {
                    var state = creep.build(site)
                    if (state == OK){
                        if(!creep.memory.no_pull) creep.memory.no_pull = true
                    }else if (state == nir) creep.moveTo(site)
                    return creep.say('out_build')
                }
            }
            var rep = creep.pos.lookFor(LOOK_STRUCTURES, { filter: r => r.structureType == STRUCTURE_ROAD })[0]
            if (rep && rep.hits < rep.hitsMax) {
                creep.say('out_repair')
                return creep.repair(rep)
            }
        }
        //link
        if(f['energy'][creep.name.split('/')[4]]['link']){
            //到时候改
        }
        var outLink = Memory.rooms[roomName]['outLink']
        if(outLink){
            if(outLink[outName]){
                
                var link = Game.getObjectById(outLink[outName][0])
                if(link){
                    if(link.store[e] < 700){
                        if(creep.transfer(link,e) == nir)creep.moveTo(link);
                        return
                    }
                    if(link.cooldown < 10 && creep.pos.getRangeTo(link) <= 5){
                        if(!creep.pos.isNearTo(link)){
                            creep.moveTo(link)
                        }
                        return
                    }
                }else{
                    if(!outLink[outName][1]){
                        if(room.name == roomName && pos_xy(creep.pos,1)){
                            let s
                            const terrain = new Room.Terrain(roomName)
                            for(let x = creep.pos.x - 1;x <= creep.pos.x + 1;x++){
                                for(let y = creep.pos.y - 1;y <= creep.pos.y + 1;y++){
                                    if(terrain.get(x,y) == 1)continue
                                    if(xy_xy(x, y, 0) || xy_xy(x, y, 1))continue
                                    if(new RoomPosition(x,y,roomName).lookFor(LOOK_STRUCTURES)[0])continue
                                    if(new RoomPosition(x,y,roomName).lookFor(LOOK_CONSTRUCTION_SITES)[0])continue
                                    s = x + '/' + y;
                                    break
                                }
                                if(s)break
                            }
                            if(s)Memory.rooms[roomName]['outLink'][outName][1] = s
                        }
                    }else{
                        var pos = s_p(Memory.rooms[roomName]['outLink'][outName][1],roomName)
                        
                        var builds = pos.lookFor(LOOK_STRUCTURES)
                        for(var build of builds){
                            if(build.structureType == 'link'){
                                Memory.rooms[roomName]['outLink'][outName][0] = build.id
                                break
                            }
                        }
                        if(!Memory.rooms[roomName]['outLink'][outName][0]){
                            var site = pos.lookFor(LOOK_CONSTRUCTION_SITES)[0]
                            if(!site){
                                pos.createConstructionSite('link')
                            }
                        }
                    }
                }
            }else if(outLink['num'] > 0){
                if(!outLink[outName]){
                    Memory.rooms[roomName]['outLink'][outName] = []
                    Memory.rooms[roomName]['outLink']['num']--
                }
            }
        }
        if (room.name != roomName || pos_xy(creep.pos, 0)) {
            creep.say('car:' + roomName)
            creep.moveTo(s_p('25/25', roomName))
        } else {
            var storage = room.storage
            if (storage && storage.store.getFreeCapacity() > 1000) {
                if (creep.transfer(storage, e) == nir) creep.moveTo(storage, { reusePath: 20 })
                return creep.say('storage')
            }
            var target = Game.getObjectById(creep.memory.target)
            if (!target || target.store.getFreeCapacity(e) <= 0) {
                if (Memory.rooms[roomName]['level'] <= 2) {
                    target = creep.pos.findClosestByRange(FIND_STRUCTURES, { filter: s => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) && s.store.getFreeCapacity(e) > 0 })
                    if (target) creep.memory.target = target.id
                } else target = null;
                if (!target) {
                    if (Memory.rooms[roomName]['energyContainer'][0]['id']) {
                        target = Game.getObjectById(Memory.rooms[roomName]['energyContainer'][0]['id'])
                        if (target.store.getFreeCapacity() > 0) creep.memory.target = target.id
                        else target = null;
                    }
                }
                if (!target) {
                    if (Memory.rooms[roomName]['energyContainer'][1]['id']) {
                        target = Game.getObjectById(Memory.rooms[roomName]['energyContainer'][1]['id'])
                        if (target.store.getFreeCapacity() > 0) creep.memory.target = target.id
                        else target = null;
                    }
                }
                if (!target) target = creep.pos.findClosestByRange(FIND_MY_CREEPS, { filter: c => c.name.split('/')[2] != 'harvester' && c.getActiveBodyparts(WORK) > 0 && c.store.getFreeCapacity() > 0 })
            }
            if (target) {
                if (creep.transfer(target, e) == nir) {
                    creep.moveTo(target,{swampCost:5})
                    if (target instanceof Creep) creep.say('creep')
                    else creep.say('structure')
                }
            } else creep.say('no')
        }
    }
}
//外矿防御
function creepOutDf(creep, roomName, outName) {
    var f = Memory.rooms[roomName]['out_energy'][outName]
    if(!f)return creep.dead();
    if (Memory.rooms[roomName]['out_energy'][outName]['state'] == 'd') {
        if (creep.room.name != outName) return creep.moveTo(s_p('25/25', outName))
        var enemy = Game.getObjectById(creep.memory.enemy)
        if (!enemy) {
            creep.memory.enemy = null;
            var enemys = creep.room.findEnemys()
            var build = creep.room.find(FIND_HOSTILE_STRUCTURES)[0]
            if (enemys.length == 0 && !build) return Memory.rooms[roomName]['out_energy'][outName]['state'] = 's'
            else if (enemys.length == 1) {
                creep.memory.enemy = enemys[0].id
            }else if (enemys.length > 1) {
                var target
                for (var enemy of enemys) {
                    if (enemy.getActiveBodyparts(HEAL) > 0) {
                        target = enemy
                        creep.memory.enemy = enemy.id
                        break
                    }
                }
                if (!target) creep.memory.enemy = enemys[0].id
            } else if (build) creep.memory.enemy = build.id
            else Memory.rooms[roomName]['out_energy'][outName]['state'] == 's'
        } else {
            var a_f = creep.attack(enemy)
            if(a_f != OK){
                if (a_f == nir) {
                    if (creep.getActiveBodyparts(HEAL) > 0 && creep.hits < creep.hitsMax) creep.heal(creep)
                    let ret = PathFinder.search(creep.pos, enemy.pos, {
                        plainCost: 1,
                        swampCost: 1,
                    })
                    creep.moveByPath(ret.path)
                }else creep.heal(creep)
            }else creep.moveTo(enemy)
        }
    } else if (creep.memory.heal) {
        if (creep.room.name != outName && Game.rooms[outRoom]) {
            var target = Game.rooms[outName].find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax })[0]
            if (target && creep.memory.target) creep.memory.target = target.id

        }
        var target = Game.getObjectById(creep.memory.target)
        if (!target || target.hits > target.hitsMax - 100) {
            target = creep.pos.findClosestByRange(FIND_MY_CREEPS, { filter: c => c != creep && c.hits <= c.hitsMax - 100 })
            if (target) creep.memory.target = target.id
            else creep.memory.heal = false
        } else if (creep.heal(target) == nir) creep.moveTo(target)
    } else creep.dead()
}
const dm = ['大猫猫']
//房间外任务爬爬分类
function creepOut(creep,workType,f) {
    var type = workType.split('/')
    if(f){
        var tick = creep.ticksToLive,s
        if(tick)s = '[tick:' + tick + ']'
        else s = '[正在孵化]'
        jumpToRoom(creep.room.name,'点击查看转至爬爬位置 =>','[爬爬名字 ' + creep.name + ']' + '当前坐标(' + creep.pos.x + ',' + creep.pos.y + ')' + s + '[from ' + type[0] + ' to ' + type[type.length - 1] + '][目的]:' + type[2]);
    }
    if (!Memory.rooms[type[0]]) return creep.suicide()
    switch (type[2]) {
        case 'claim':
            claimRoom(creep,type);
            break;
        case 'help':
            helpRoom(creep,type);
            break;
        case 'ATK':
            ATKRoom(creep,type);
            break;
    }
}
//过道爬爬分类
function creepAisle(creep,workType,f){
    var type = workType.split('/')
    if(f){
        var tick = creep.ticksToLive,s
        if(tick)s = '[tick:' + tick + ']'
        else s = '[正在孵化]'
        jumpToRoom(creep.room.name,'点击查看转至爬爬位置 =>','[爬爬名字 ' + creep.name + ']' + '当前坐标(' + creep.pos.x + ',' + creep.pos.y + ')' + s + '[from ' + type[0] + ' to ' + type[type.length - 1] + '][目的]:挖过道(' + type[3] + ')');
    }
    if (!Memory.rooms[type[0]]) return creep.suicide()
    if(type[2] == 'power'){
        aisle_.aislePower(creep,type)
    }else aisle_.aisleDeposit(creep,type)
}
const aisle_ = {
    //挖抛瓦分类
    aislePower : function(creep,type){
        return creep.suicide()
        if(type[3] == 'attack')this.aislePowerAttack(creep,type)
        else this.aislePowerHeal(creep,type)
    },
    //攻击爬
    aislePowerAttack(creep,type){
        //初始化
        if(!creep.memory.heal){
            creep.memory.heal = {}
            creep.memory.heal['name'] = Object.keys(Memory.rooms[type[0]]['aisle_task'][type[4]]['creeps']['power']['heal'])[0]
            creep.memory.powerBank = Memory.rooms[type[0]]['aisle_task'][type[4]]['id']
            creep.memory.heal['near'] = false
            creep.memory.boost = false
        }
        //等奶爬
        if(!creep.memory.heal['near']){
            var healcreep = Game.creeps[creep.memory.heal['name']]
            if(pos_xy(creep.pos,0)){
                creep.memory.heal['near'] = true
            }else
            if(!healcreep || !creep.pos.isNearTo(healcreep)){
                creep.say('等会奶妈')
            }else {
                creep.say('奶妈来了，走起')
                creep.memory.heal['near'] = true
            }
            return 
        }
        // else if(Game.time % 10 == 0){
        //     var healcreep = Game.creeps[creep.memory.heal['name']]
        //     if(!creep.pos.isNearTo(healcreep)){
        //         creep.memory.heal['near'] = false
        //         return
        //     }
        // }
        var targetName = type[4]
        //靠近pb
        if(!creep.memory.beginAttack){
            if(creep.room.name != targetName || pos_xy(creep.pos,0)){
                // if(!creep.memory.path || !creep.memory.path[0]){
                //     let s = Memory.rooms[type[0]]['aisle_task'][type[4]]['pos']
                //     aisle_.aisleFindPath_memory(creep,s_p(s,type[4]))
                // }
                // aisle_.aisleMove(creep)
                // return creep.say('\\大猫猫/',true)
                var pos = s_p(Memory.rooms[type[0]]['aisle_task'][type[4]]['pos'],type[4])
                creep.moveTo(pos)
            }
            if(creep.room.name == targetName){
                var healcreep = Game.creeps[creep.memory.heal['name']]
                var powerBank = Game.getObjectById(creep.memory.powerBank)
                if(!powerBank){
                    console.log(type[0],'挖抛瓦任务过期了')
                    delete Memory.rooms[type[0]]['aisle_task'][type[4]]
                    delete Memory.aisle[type[4]]
                    creep.suicide()
                    if(healcreep)healcreep.suicide()
                    return
                }else{
                    if(!creep.pos.isNearTo(powerBank)) creep.moveTo(powerBank)
                    else creep.memory.beginAttack = true
                }
            }
            return creep.say('\\大猫猫/',true)
        }
        //攻击
        if(creep.memory.beginAttack){
            var powerBank = Game.getObjectById(creep.memory.powerBank)
            if(powerBank){
                if(creep.attack(powerBank) == nir)creep.moveTo(powerBank)
            }else{
                delete Memory.rooms[type[0]]['aisle_task'][type[4]]
                delete Memory.aisle[type[4]]
                console.log(type[0],'过道任务=>',type[4],'完成')
            }
            return
        }
        //保护

    },
    //奶爬
    aislePowerHeal(creep,type){
        //初始化
        if(!creep.memory.attack){
            creep.memory.attack = {}
            creep.memory.attack['name'] = Object.keys(Memory.rooms[type[0]]['aisle_task'][type[4]]['creeps']['power']['attack'])[0]
            creep.memory.attack['near'] = false
            creep.memory.boost = false
        }
        //奶
        var attackcreep = Game.creeps[creep.memory.attack['name']]
        if(attackcreep){
            if(!attackcreep.memory.beginAttack){
                if(creep.memory.attack['near'])creep.move(creep.pos.getDirectionTo(attackcreep));
                else {
                    creep.moveTo(attackcreep)
                }
            }else {
                creep.heal(attackcreep)
            }
        }else creep.suicide()
    },
    //挖沉淀物
    aisleDeposit:function(creep,type){
        
    },
    //抛瓦攻击爬boost
    aislePowerAttackBoost:function(creep,type){

    }
    ,
    aisleFindPath_memory:function(creep,endPos){
        var creepPos = creep.pos
        let ret = PathFinder.search(creepPos, endPos, {
            plainCost: 2,
            swampCost: 10,
            ignoreCreeps: true,
            maxOps:5000,
            roomCallback: function (roomName) {
                let room = Game.rooms[roomName]
                if (!room) return
                let costs = new PathFinder.CostMatrix;
                room.find(FIND_STRUCTURES).forEach(function (s) {
                    var type = s.structureType;
                    if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                    else if (!s.my || (s.structureType != 'container' && s.structureType != 'rampart')) costs.set(s.pos.x, s.pos.y, 255)
                })
                room.find(FIND_CONSTRUCTION_SITES).forEach(function (s) {
                    var type = s.structureType;
                    if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                    else costs.set(s.pos.x, s.pos.y, 255)
                })
                return costs
            }
        })
        creep.memory.path = []
        for(var pos of ret.path){
            creep.memory.path.push(pos)
        }
        return ret
    },
    aisleMove : function(creep){
        if(creep.memory.path && creep.memory.path[0]){
            var memory_pos = creep.memory.path[0]
            if(!memory_pos)return
            var pos = xy_p(memory_pos.x, memory_pos.y, memory_pos.roomName)
            if(creep.pos.isEqualTo(pos)){
                creep.memory.path.splice(0,1);
                memory_pos = creep.memory.path[0]
                if(!memory_pos)return
                pos = xy_p(memory_pos.x, memory_pos.y, memory_pos.roomName)
            }
            creep.moveTo(pos)
        }
    }
}
//家外面
//外爬配置
const outCreepBodyConfig ={
    claim:[[CLAIM],[MOVE],6],
    help:{
        buildMy:[[WORK,WORK,MOVE,CARRY,MOVE,MOVE],[WORK,CARRY,MOVE,MOVE],50],
        energy:[[CARRY,MOVE],[CARRY,MOVE],50]
    },
    ATK:{
        claim :[[CLAIM,MOVE],[CLAIM,MOVE],50],
        attack:[[ATTACK,MOVE],[ATTACK,MOVE],50]
    },
    power:{
        attack:[[ATTACK,MOVE],[ATTACK,MOVE],8],
        heal:[[HEAL,MOVE],[HEAL,MOVE],10]
        // attack:[[ATTACK,MOVE],[ATTACK,MOVE],40],
        // heal:[[HEAL,MOVE],[HEAL,MOVE],50]
    },
}
//创建名字内存
const more1 = ['help','ATK']
function createName(flag,n){
    if(flag.memory.creepName) return
    else flag.memory.creepName = randomName() + '/' + n[n.length - 1]
    var outCreepAll = Memory.rooms[n[0]]['outCreeps']
    if(!outCreepAll)Memory.rooms[n[0]]['outCreeps'] = {}
    if(more1.indexOf(n[1]) == -1){
        if(!outCreepAll[n[1]]){
            Memory.rooms[n[0]]['outCreeps'][n[1]] = {}
        }else{
            if(!Memory.rooms[n[0]]['outCreeps'][n[1]][flag.memory.creepName]){
                Memory.rooms[n[0]]['outCreeps'][n[1]][flag.memory.creepName] = n[0] + '/out/' + n[1] + '/' + flag.pos.roomName
            }
        }
    }else{
        if(!outCreepAll[n[1]]){
            Memory.rooms[n[0]]['outCreeps'][n[1]] = {}
        }
        if(!Memory.rooms[n[0]]['outCreeps'][n[1]][n[2]]){
            Memory.rooms[n[0]]['outCreeps'][n[1]][n[2]] = {}
        }
        if(!Memory.rooms[n[0]]['outCreeps'][n[1]][n[2]][flag.memory.creepName]){
            Memory.rooms[n[0]]['outCreeps'][n[1]][n[2]][flag.memory.creepName] = n[0] + '/out/' + n[1] + '/' + n[2] + '/' + flag.pos.roomName
        }
    }
}
//房间外寻路
function outCreepPath(creep, end) {
    var creepPos = creep.pos,endPos = end.pos
    let ret = PathFinder.search(creepPos, endPos, {
        plainCost: 2,
        swampCost: 10,
        ignoreCreeps: true,
        roomCallback: function (roomName) {
            let room = Game.rooms[roomName]
            if (!room) return
            let costs = new PathFinder.CostMatrix;
            room.find(FIND_STRUCTURES).forEach(function (s) {
                var type = s.structureType;
                if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                else if (!s.my || (s.structureType != 'container' && s.structureType != 'rampart')) costs.set(s.pos.x, s.pos.y, 255)
            })
            room.find(FIND_CONSTRUCTION_SITES).forEach(function (s) {
                var type = s.structureType;
                if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                else costs.set(s.pos.x, s.pos.y, 255)
            })
            return costs
        }
    })
    return ret
}
//房间内寻路
function inCreepPath(creep,end){
    var creepPos = creep.pos,endPos = end.pos
    let ret = PathFinder.search(creepPos, endPos, {
        plainCost: 2,
        swampCost: 10,
        ignoreCreeps: true,
        roomCallback: function (roomName) {
            if (roomName != creepPos.roomName) return
            let room = Game.rooms[roomName]
            let costs = new PathFinder.CostMatrix;
            room.find(FIND_STRUCTURES).forEach(function (s) {
                var type = s.structureType;
                if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                else if (!s.my || (s.structureType != 'container' && s.structureType != 'rampart')) costs.set(s.pos.x, s.pos.y, 255)
            })
            room.find(FIND_CONSTRUCTION_SITES).forEach(function (s) {
                var type = s.structureType;
                if (type == STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 1)
                else costs.set(s.pos.x, s.pos.y, 255)
            })
            return costs
        }
    })
    return ret
}
//获取旗子(2)并缓存路径
function memory_flag_2(creep,type){
    if(!creep.memory.flagName){
        var flagName = type[0] + '/' + type[2] + '/' + creep.name.split('/')[1]
        var flag = Game.flags[flagName]
        if(flag)creep.memory.flag = flagName
    }
    var flag = Game.flags[creep.memory.flag]
    if(flag){
        if(!creep.memory.path)creep.memory.path = []
        if(creep.memory.path.length == 0 && creep.room.name != flag.pos.roomName){
            var ret = outCreepPath(creep,flag)
            creep.memory.path = []
            for(var pos of ret.path){
                creep.memory.path.push(pos)
            }
        }
        return flag
    }else return false
}
//获取旗子(3)并缓存路径
function memory_flag_3(creep,type){
    if(!creep.memory.flagName){
        var flagName = type[0] + '/' + type[2] + '/' + type[3] + '/' + creep.name.split('/')[1]
        var flag = Game.flags[flagName]
        if(flag)creep.memory.flag = flagName
    }
    var flag = Game.flags[creep.memory.flag]
    if(flag){
        if(!creep.memory.path)creep.memory.path = []
        if(creep.memory.path.length == 0 && creep.room.name != flag.pos.roomName){
            var ret = outCreepPath(creep,flag)
            creep.memory.path = []
            for(var pos of ret.path){
                creep.memory.path.push(pos)
            }
        }
        return flag
    }else return false
}
//claim
function claimRoom(creep,type){
    var targetName = type[type.length - 1]
    creep.say('占领'+targetName)
    var flag = memory_flag_2(creep,type)
    if(!flag)delete Memory.rooms[type[0]]['outCreeps']['claim'][creep.name]
    var targetRoom = Game.rooms[targetName]
    var controller = targetRoom.controller
    if(creep.room.name == type[3]){
        if (controller.my || !controller) {
            if(flag){
                delete Memory.flags[flag.name]
                flag.remove()
            }
            delete Memory.rooms[type[0]]['outCreeps']['claim'][creep.name]
            creep.suicide()
            return 
        }
        if ((!controller.owner && !controller.reservation) || (controller.reservation && controller.reservation.username == Memory.playerName)) {
            if (creep.claimController(controller) == nir) creep.moveTo(controller,{swampCost:0})
            return
        }
        return
    }
    outCreepMove(creep)
}
//help
function helpRoom(creep,type){
    var targetName = type[type.length - 1]
    creep.say('help' + targetName)
    switch(type[3]){
        case 'buildMy':
            helpBuildMy(creep,type)
            break
        case 'energy':
            helpEnergy(creep,type)
            break
    }
}
//help => buildMy
function helpBuildMy(creep,type){
    var flag = memory_flag_3(creep,type)
    if(!flag)delete Memory.rooms[type[0]]['outCreeps']['help'][type[3]][creep.name]
    var creepMemory_energy = creep.memory.energy
    var room = creep.room
    if(!creepMemory_energy && creep.store.getFreeCapacity() == 0){
        creep.memory.energy = true;
        creep.memory.site == false
        creep.memory.source = false;
    }
    if(creepMemory_energy && creep.store.getUsedCapacity() == 0)creep.memory.energy = false;
    if(creepMemory_energy){
        if(creep.buildHomeSite() != -1)return
        if(room.energyAvailable == room.energyCapacityAvailable){
            creep.upController(room.controller,{swampCost:2})
        }else{
            var target = Game.getObjectById(creep.memory.target)
            if(!target || target.store.getFreeCapacity(e) == 0){
                target = room.find(FIND_MY_STRUCTURES,{filter:s=>(s.structureType == 'extension' || s.structureType == 'spawn') && s.store.getFreeCapacity(e) > 0})[0]
                if(target)creep.memory.target = target.id
            }
            if(target){
                if(creep.transfer(target,e) == nir) creep.moveTo(target,{swampCost:2})
                return
            }
        }
    }else {
        var storage = room.storage
        if(!storage){
            if(room.controller.level >= 2){
                var container = Game.getObjectById(creep.memory.container)
                if(!container || container.store.getUsedCapacity() == 0){
                    container = room.find(FIND_STRUCTURES,{filter:s=>s.structureType == 'container' && s.store.getUsedCapacity(e) > creep.store.getCapacity() - 100})[0]
                    if(container) creep.memory.container = container.id
                }
                if(container){
                    if(creep.withdraw(container,e) == nir)creep.moveTo(container)
                    return
                }
            }
            var d = Game.getObjectById(creep.memory.d)
            if(!d && Game.time % 5 == 0){
                d = room.find(FIND_DROPPED_RESOURCES,{filter:s=>s.amount > 200})[0]
                if(d)creep.memory.d = d.id
            }
            if(d){
                if(creep.pickup(d) == nir)creep.moveTo(d)
                return
            }
            var source = Game.getObjectById(creep.memory.source)
            if(!source || source.energy == 0){
                source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE,{swampCost:0})
                if(source)creep.memory.source = source.id
            }
            if(source){
                if(creep.harvest(source) == nir) creep.moveTo(source,{swampCost:0,visualizePathStyle:{stroke:'white'}})
                return
            }
        }else{
            if(storage.store[e] > 0){
                if(creep.withdraw(storage,e) == nir)moveTo(storage)
            }else{
                var terminal = room.terminal
                if(terminal){
                    if(terminal.store[e] > 0){
                        if(creep.withdraw(storage,e) == nir)moveTo(storage)
                    }
                }
            }
        }
    }
    outCreepMove(creep)
}
//help => energy
function helpEnergy(creep,type){
    var flag = memory_flag_3(creep,type)
    if(!flag)delete Memory.rooms[type[0]]['outCreeps']['help'][type[3]][creep.name]
    if(creep.store.getFreeCapacity() == 0){
        if(creep.room.name == type[4]){
            var storage = creep.room.storage
            if(creep.transfer(storage,e) == nir)creep.moveTo(storage)
            return
        }else{
            var room = Game.rooms[type[4]]
            if(room){
                var ret = outCreepPath(creep,room.storage)
                creep.memory.path = []
                for(var pos of ret.path){
                    creep.memory.path.push(pos)
                }
            }else{
                var ret = outCreepPath(creep,{pos : new RoomPosition(25,25,type[4]),a})
                creep.memory.path = []
                for(var pos of ret.path){
                    creep.memory.path.push(pos)
                }
            }
        }
    }else{
        if(creep.room.name == type[0]){
            var storage = creep.room.storage
            if(creep.withdraw(storage,e) == nir)creep.moveTo(storage)
            return
        }else{
            var room = Game.rooms[type[0]]
            if(room){
                var ret = outCreepPath(creep,room.storage)
                creep.memory.path = []
                for(var pos of ret.path){
                    creep.memory.path.push(pos)
                }
            }else{
                var ret = outCreepPath(creep,{pos : new RoomPosition(25,25,type[0]),a})
                creep.memory.path = []
                for(var pos of ret.path){
                    creep.memory.path.push(pos)
                }
            }
        }
    }
    outCreepMove(creep)
}

//寻路移动
function outCreepMove(creep){
    if(creep.memory.path && creep.memory.path[0]){
        var memory_pos = creep.memory.path[0]
        var pos = xy_p(memory_pos.x, memory_pos.y, memory_pos.roomName)
        if(creep.pos.isEqualTo(pos)){
            creep.memory.path.splice(0,1);
            memory_pos = creep.memory.path[0]
            pos = xy_p(memory_pos.x, memory_pos.y, memory_pos.roomName)
        }
        creep.moveTo(pos)
    }
}
//删除缓存(ATK)
function delete_ATK(creep,type){
    delete Memory.flags[creep.memory.flag]
    delete Memory.rooms[type[0]]['outCreeps']['ATK'][type[3]][creep.name]
    creep.suicide()
}

//ATK
function ATKRoom(creep,type){
    creep.say('ATK'+type[4])
    switch(type[3]){
        case 'attack':
            ATKRoomAttack(creep,type)
            break
        case 'claim':
            ATKRoomClaim(creep,type)
            break
    }
}
//ATK => attack
function ATKRoomAttack(creep,type){
    var flag = memory_flag_3(creep,type)
    if(!flag)delete Memory.rooms[type[0]]['outCreeps']['ATK'][type[3]][creep.name]
    var targetRoom = type[4]
    if(creep.room.name == targetRoom){
        if(creep.memory.path.length > 0)creep.memory.path = []
        var build
        if(flag){
            build = flag.pos.lookFor(LOOK_STRUCTURES)[0]
            if(build){
                if(creep.attack(build) == nir){
                    creep.moveTo(build)
                }
                return
            }
        }
        build = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES)
        if(build){
            if(creep.attack(build) == nir){
                creep.moveTo(build)
            }
            return
        }
        var enemyCreep = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS)
        if(enemyCreep){
            if(creep.attack(enemyCreep) == nir){
                creep.moveTo(enemyCreep)
            }
            return
        }
        delete_ATK(creep,type)
        return flag.remove()
    }
    outCreepMove(creep)
}
//ATK => claim
function ATKRoomClaim(creep,type){
    creep.say('CLA'+type[4])
    var flag = memory_flag_3(creep,type)
    if(!flag) delete Memory.rooms[type[0]]['outCreeps']['ATK'][type[3]][creep.name]
    var targetRoom = type[4]
    if(creep.room.name == targetRoom && !pos_xy(creep.pos, 0)){
        var controller = creep.room.controller
        if(!controller)return delete_ATK(creep,type)
        if(controller.upgradeBlocked > 0)return 
        if(!creep.pos.isNearTo(controller))return creep.moveTo(controller)
        if((controller.reservation && controller.reservation.username != Memory.playerName) || (controller.owner && controller.owner.username != Memory.playerName))return creep.attackController(controller)
        return creep.reserveController(controller)
    }
    outCreepMove(creep)
}

//控制台转跳房间
function jumpToRoom(roomName,str1,str2){
    if(str1 == 0)return console.log(`<a href="#!/room/${Game.shard.name}/${roomName}">${roomName}</a>` ,str2)
    else if(str2 == 0)return console.log(str1 , `<a href="#!/room/${Game.shard.name}/${roomName}">${roomName}</a>`)
    else return console.log(str1 , `<a href="#!/room/${Game.shard.name}/${roomName}">${roomName}</a>` ,str2)
}
//随机名字
function randomName() {
    var n = Math.floor(10 + Math.random() * 10)
    var name = 'dm';
    for (var i = 0; i < n; i++) {
        var type = Math.ceil(Math.random() * 3);
        switch (type) {
            case 1:
                name += (Math.floor(Math.random() * 10))
                break
            case 2:
                name += (String.fromCharCode(65 + Math.ceil(Math.random() * 25)))
                break;
            case 3:
                name += (String.fromCharCode(97 + Math.ceil(Math.random() * 25)))
                break;
        }
    }
    return name
}
//爬爬身体部件系统
function bodyCost(body) {
    return _.reduce(body, (sum, part) => sum + BODYPART_COST[part], 0);
}
function creepbody(body, add, room, length) {
    var energyMax = room.energyCapacityAvailable
    while (bodyCost(body) + bodyCost(add) <= energyMax && body.length + add.length <= length) {
        body = body.concat(add);
    }
    body = tz_body(body)
    return body
}
function tz_body(body) {
    var tough = body.filter(function (b) { return b == TOUGH }).length
    var rat = body.filter(function (b) { return b == RANGED_ATTACK }).length
    var at = body.filter(function (b) { return b == ATTACK }).length
    var heal = body.filter(function (b) { return b == HEAL }).length
    var move = body.filter(function (b) { return b == MOVE }).length
    var carry = body.filter(function (b) { return b == CARRY }).length
    var work = body.filter(function (b) { return b == WORK }).length
    var claim = body.filter(function (b) { return b == CLAIM }).length
    var body = []
    body = zz_body(body, [TOUGH], tough)
    body = zz_body(body, [WORK], work)
    body = zz_body(body, [RANGED_ATTACK], rat)
    body = zz_body(body, [ATTACK], at)
    body = zz_body(body, [CARRY], carry)
    body = zz_body(body, [CLAIM], claim)
    body = zz_body(body, [MOVE], move)
    body = zz_body(body, [HEAL], heal)
    return body
}
function zz_body(body, type, amount) {
    if (amount == 0) return body
    for (var i = 0; i < amount; i++) {
        body = body.concat(type)
    }
    return body
}
//获取房间内spawn
function getSpawn(roomName) {
    var room = Game.rooms[roomName]
    if (!room) return null;
    var level = room.controller.level
    var s = 0;
    var saveSpawn = null
    for (var spawnName in Game.spawns) {
        var spawn = Game.spawns[spawnName]
        if (spawn.room.name == roomName) {
            if(!saveSpawn)saveSpawn = spawn
            if (level < 7) return spawn
            if (level == 7) {
                if (s == 1 || !spawn.spawning) return spawn
                s++;
            }
            if (level == 8) {
                if (s == 2 || !spawn.spawning) return spawn
                s++;
            }
        }
    }
    return saveSpawn;
}
//定时清理不存在的爬的内存
function clearCreep(time) {
    if (Game.time % time) return
    for (var name in Memory.creeps) {
        var creep = Game.creeps[name]
        if (!creep) delete Memory.creeps[name];
        // else{
        //     if(creep.memory.workType){
        //         var f = false;//假设爬不在内存里
        //         var m = Memory.rooms[creep.room.name]['creeps']['work_' + creep.memory.workType.split('/')[2]]
        //         if(m && m.num && m.name){
        //             for(var i of m.name){
        //                 if(i == name){
        //                     f = true
        //                     break;
        //                 }
        //             }
        //         }else{
        //             m = Memory.rooms[creep.room.name]['creeps'][creep.memory.workType.split('/')[2]]
        //             if(i == m.name) f = true
        //         }
        //         if(!f) creep.suicide();
        //     }
        // }
    }
}
var sifu = false
if(!Game.cpu.generatePixel)sifu = true
//搓pixel
function getPixel() {
    if (!sifu && Game.cpu.bucket == 10000) Game.cpu.generatePixel();
}
//初始化
function newGame() {
    Memory.playerName = Game.spawns[Object.keys(Game.spawns)[0]].owner.username
    Memory.whiteList = ['BigCatCat'];
    Memory.rooms = {};
    Memory.aisle = {};
    console.log('初始化成功')
}


//计算
//(pos,i)是否在某边上
function pos_xy(pos, i) {
    if (pos.x == 0 + i || pos.x == 49 - i || pos.y == 0 + i || pos.y == 49 - i) return true
    return false
}
//(pos,i)是否在某边上
//(x,y,i)
function xy_xy(x, y, i) {
    if (x == 0 + i || x == 49 - i || y == 0 + i || y == 49 - i) return true
    return false
}
//x,y => 'x/y'
function xy_s(x, y) {
    return x + '/' + y
}
//x,y,roomName => pos
function xy_p(x, y, roomName) {
    return new RoomPosition(x, y, roomName)
}
//pos => 'x/y'
function p_s(pos) {
    return pos.x + '/' + pos.y;
}
//'x/y',roomName => pos
function s_p(str, roomName) {
    var s = str.split('/')
    return new RoomPosition(s[0], s[1], roomName)
}
//'x/y' => [x,y]
function s_xy(str) {
    var s = str.split('/')
    return [parseInt(s[0]), parseInt(s[1])]
}
//'x1/y1'到'x2/y2'的距离
function ss_distance(str1, str2) {
    var s1 = str1.split('/'), s2 = str2.split('/')
    return Math.max(Math.abs(s1[0] - s2[0]), Math.abs(s1[1] - s2[1]))
}
//'x/y'到pos的距离
function sp_distance(str, pos) {
    var s = str.split('/')
    return Math.max(Math.abs(s[0] - pos.x), Math.abs(s[1] - pos.y))
}
//x,y到'x/y'的距离
function xys_distance(x, y, str) {
    var s = str.split('/')
    return Math.max(Math.abs(s[0] - x), Math.abs(s[1] - y))
}
//x,y到pos的距离
function xyp_distance(x, y, pos) {
    return Math.max(Math.abs(pos.x - x), Math.abs(pos.y - y))
}
//勾股
function xyp_gg(x, y, pos) {
    var a = Math.pow(Math.abs(pos.x - x), 2)
    var b = Math.pow(Math.abs(pos.y - y), 2)
    var c = Math.sqrt(a * a + b * b)
    return c
}
Creep.prototype.dead = function () {
    if(this.room.controller.level >= 6 && Memory.rooms[this.room.name]['rubbish']['id']){
        var container = Game.getObjectById(Memory.rooms[this.room.name]['rubbish']['id'])
        if(container){
            if(!this.pos.isEqualTo(container))this.moveTo(container)
            else this.suicide()
            return
        }
    }
    if (this.memory.workType){
        if(this.room.name != this.memory.workType.split('/')[0]) return this.moveTo(s_p('25/25', this.memory.workType.split('/')[0]))
    }else{
        if(this.room.name != this.name.split('/')[0]) return this.moveTo(s_p('25/25', this.name.split('/')[0]))
    }
    if(this.getActiveBodyparts(CARRY) > 0 && this.store.getUsedCapacity() > 0){
        var storage = this.room.storage
        if(storage){
            if(this.transfer(storage,e) == nir)return this.moveTo(storage)
        }
    }
    var container = Game.getObjectById(this.memory.dead)
    if (!container || container.store[e] > 1850 || (Game.time % 10 == 0 && container.pos.lookFor(LOOK_CREEPS)[0] && container.pos.lookFor(LOOK_CREEPS)[0] != this)) {
        container = this.pos.findClosestByRange(FIND_STRUCTURES, { filter: c => c.structureType == 'container' && c.store.getFreeCapacity() > 50 && !c.pos.lookFor(LOOK_CREEPS)[0] })
        if (container) this.memory.dead = container.id
    }
    if (container) {
        if (!this.pos.isEqualTo(container)) this.moveTo(container)
        else this.suicide()
        this.say('dead')
        return true
    }
    if (this.store[e] > 0) {
        var target = Game.getObjectById(this.memory.give)
        if (!target || target.store.getFreeCapacity() < 20) {
            target = this.pos.findClosestByRange(FIND_MY_CREEPS, { filter: c => c != this && c.getActiveBodyparts(WORK) > 0 && c.store.getFreeCapacity() > 30 })
            if (target) this.memory.give = target.id
        }
        if (target) {
            if (this.transfer(target, e) == nir) {
                this.moveTo(target)
                this.say('give dead')
                if (this.memory.no_pull) this.memory.no_pull = false
                return true
            }else if (!this.memory.no_pull) this.memory.no_pull = true
        } else this.suicide();
    } else this.suicide()
    return true
}
Creep.prototype.healLive = function () {
    var spawn = Game.getObjectById(this.memory.spawn)
    if (spawn) {
        if (!spawn.spawning) {
            if (spawn.renewCreep(this) == nir) this.moveTo(spawn)
            return true
        } else return false
    }
    if (!spawn) {
        spawn = this.pos.findClosestByRange(FIND_STRUCTURES, { filter: s => s.structureType == 'spawn' })
        if (spawn) this.memory.spawn = spawn.id
    }
    return false
}
Creep.prototype.upController = function (controller) {
    if(!Memory.rooms[this.room.name]){
        if(!this.pos.isNearTo(controller))this.moveTo(controller)
        else this.upgradeController(controller)
    }else{
        var level = Memory.rooms[this.room.name]['level']
        if(level < 8){
            var f = this.upgradeController(controller)
            if (f == OK && !this.memory.no_pull) this.memory.no_pull = true
            else if (f == nir) return this.moveTo(controller)
            return f
        }else{
            if(!this.pos.isNearTo(controller))this.moveTo(controller)
            else this.upgradeController(controller)
        }
    }
}
//建筑权重
const qz = {
    'spawn':1,
    'storage':2,
    'terminal':3,
    'extension':4,
    'container':5,
    'road':6,
    'tower':7,
    'link':8
}
Creep.prototype.buildHomeSite = function () {
    if(!this.memory.sites) this.memory.sites = {}
    this.memory.sites = {}
    var site = Game.getObjectById(this.memory.site)
    if (!site) {
        if(Object.keys(this.memory.sites).length == 0){
            var sites = this.room.find(FIND_CONSTRUCTION_SITES)
            if (sites.length == 0){
                var level = Memory.rooms[this.room.name]['level']
                if (level == 2) Memory.rooms[this.room.name]['creeps']['work_up']['num'] = 6
                else if (level == 3) Memory.rooms[this.room.name]['creeps']['work_up']['num'] = 4
                else if (level == 4) Memory.rooms[this.room.name]['creeps']['work_up']['num'] = 3
                Memory.rooms[this.room.name]['creeps']['work_build']['num'] = 1;
                Memory.rooms[this.room.name]['building'] = false;
                return
            }else{
                sites.forEach(site =>{
                    if(qz[site.structureType]) site.i = qz[site.structureType]
                    else site.i = 10
                })
                sites = sites.sort((a,b)=>(a.i - b.i));
                sites.forEach(site =>{
                    if(!this.memory.sites[site.structureType]){
                        this.memory.sites[site.structureType] = {}
                    }
                    this.memory.sites[site.structureType][site.id] = p_s(site.pos);
                })
            }
        }
        //找建筑数组
        var finds = [];
        for(var type in this.memory.sites){
            if(Object.keys(this.memory.sites[type]).length == 0){
                delete this.memory.sites[type]
                continue
            }
            for(var siteId in this.memory.sites[type]){
                site = Game.getObjectById(siteId)
                if(!site)delete this.memory.sites[type][siteId]
                else{
                    finds.push([siteId,this.memory.sites[type][siteId]])
                }
            }
            if(site)break
        }
        //找最近
        finds.forEach(find =>{
            let xy = find[1].split('/')
            let x = xy[0]
            let y = xy[1]
            let tp = this.pos
            let tx = tp.x
            let ty = tp.y
            find.len = Math.min(Math.abs(x - tx),Math.abs(y - ty))
        })
        finds = finds.sort((a,b) => (a.len - b.len))
        site = Game.getObjectById(finds[0][0])
        this.memory.site = site.id
    }
    if (site) {
        if (site.structureType != 'road' && site.structureType != 'container' && Game.time % 10 == 0) {
            var look = site.pos.lookFor(LOOK_CREEPS)[0]
            if (look) look.moveTo(this.room.controller);
        }
        var f = this.build(site)
        if (f == OK && !this.memory.no_pull) this.memory.no_pull = true
        else if (f == nir) return this.moveTo(site)
        return f
    }
    return -1
}
Creep.prototype.harvestHomeEnergy = function (source, container) {
    if (!source || source.energy == 0) return -1
    if (container && container.store.getFreeCapacity() == 0 && this.store.getFreeCapacity() == 0) return -1
    if (!this.memory.no_move && this.room.controller.level >= 3 && source.pos.findInRange(FIND_MY_CREEPS, 1, { filter: c => c != this && c.memory.workType && c.memory.workType.split('/')[2] == 'source' }).length == 1) {
        if(this.memory.source == Memory.rooms[this.room.name]['sources'][0]['id']){
            this.memory.source = Memory.rooms[this.room.name]['sources'][1]['id']
        }else this.memory.source = Memory.rooms[this.room.name]['sources'][0]['id']
        this.memory.container = null
    }
    var h = this.harvest(source)
    if (h == OK){
        if(!this.memory.no_pull) this.memory.no_pull = true
        if(!this.memory.no_move) this.memory.no_move = true
    }else if (h == nir) {
        if (this.memory.no_pull) this.memory.no_pull = false
        if (this.memory.no_move) this.memory.no_move = false
        var f = this.moveTo(source)
        if (f == ERR_NO_PATH) {
            this.say('找不到路重新寻找能量')
            if(this.memory.source == Memory.rooms[this.room.name]['sources'][0]['id']){
                this.memory.source = Memory.rooms[this.room.name]['sources'][1]['id']
            }else this.memory.source = Memory.rooms[this.room.name]['sources'][0]['id']
            this.memory.container = null
            this.memory.link = null
            if(creep.store[e] > 0)creep.drop(e)
        }
    }
    return h
}
Creep.prototype.carryHome = function (roomName) {
    if (this.memory.no_pull) this.memory.no_pull = false;
    if (Memory.rooms[roomName]['ruin_energy']) {
        var target = Game.getObjectById(this.memory.ruin)
        if (!target || target.store[e] == 0) {
            target = this.room.find(FIND_RUINS, { filter: r => r.store[e] > 0 })[0]
            if (target) this.memory.ruin = target.id
            else {
                Memory.rooms[roomName]['ruin_energy'] = false;
            }
        }
        if (target) {
            if (this.withdraw(target, e) == nir) this.moveTo(target)
        }
        return
    }
    var room = this.room
    var storage = room.storage
    if (Memory.rooms[roomName]['ruin'] && storage) {
        var target = Game.getObjectById(this.memory.ruin)
        if (!target || target.store.getFreeCapacity() == 0) {
            target = this.room.find(FIND_RUINS, { filter: r => r.store.getUsedCapacity() > 0 })[0]
            if (target) this.memory.ruin = target.id
            else {
                Memory.rooms[roomName]['ruin'] = false;
            }
        }
        if (target) {
            var type = null;
            for (var t in target.store) {
                if (t) {
                    type = t;
                    break
                }
            }
            if (this.withdraw(target, type) == nir) this.moveTo(target)
        }
        return
    }
    var level = Memory.rooms[roomName]['level']
    if (level <= 2 || Game.time % 11 == 0 || this.memory.d) {
        var d = Game.getObjectById(this.memory.d)
        if (!d || d.amount < this.store.getFreeCapacity() / 5) {
            d = this.pos.findClosestByRange(FIND_DROPPED_RESOURCES, { filter: a => a.amount > this.store.getCapacity() / 2 })
            if (d) this.memory.d = d.id
            else this.memory.d = null
        }
        if (d) {
            if (this.pickup(d) == nir) this.moveTo(d)
            return
        }
    }
    
    var type = this.memory.workType.split('/')[2]
    var en = room.energyAvailable, enm = room.energyCapacityAvailable
    if (storage && storage.store[e] > 10000 && type == 'carryer') {
        if (en < enm - 1100) {
            if (this.withdraw(storage, e) == nir) this.moveTo(storage)
            return
        }
    }
    if ((type != 'carry') && storage && storage.store[e] > 5000) {
        if (this.withdraw(storage, e) == nir) this.moveTo(storage)
        return
    }
    var target = Game.getObjectById(this.memory.target)
    if (!target || target.store[e] < this.store.getCapacity()) {
        if (type == 'carry') {
            target = this.pos.findClosestByRange(FIND_STRUCTURES, { filter: c => c.structureType == STRUCTURE_CONTAINER && sp_distance(Memory.rooms[roomName]['center'], c.pos) > 2 && c.store[e] > this.store.getCapacity() })
        } else {
            target = this.pos.findClosestByRange(FIND_STRUCTURES, { filter: c => c.structureType == STRUCTURE_CONTAINER && c.store[e] > this.store.getCapacity() - 50})
        }
        if (target) this.memory.target = target.id
        else this.memory.target = null
    }
    if (target) {
        if (this.withdraw(target, e) == nir) this.moveTo(target)
    } else {
        if (type == 'carry' && en >= enm && Memory.rooms[roomName]['state'] == 's') {
            if (Memory.rooms[roomName]['energyContainer'][0]['id']) var c1 = Game.getObjectById(Memory.rooms[roomName]['energyContainer'][0]['id'])
            if (Memory.rooms[roomName]['energyContainer'][1]['id']) var c2 = Game.getObjectById(Memory.rooms[roomName]['energyContainer'][1]['id'])
            if ((c1 && c1.store.getFreeCapacity() <= 0) || (c2 && c2.store.getFreeCapacity() <= 0)) {
                if (this.memory.no_pull) this.memory.no_pull = false
                return false
            }
        }
        if (storage && storage.store[e] > 0){
            if(this.withdraw(storage, e) == nir) this.moveTo(storage)
        }else {
            var terminal = room.terminal
            if(terminal && terminal.store[e] > 0 && this.withdraw(terminal, e) == nir) this.moveTo(terminal)
        }
    }
}
Creep.prototype.repairHomeWall = function () {
    var wall = Game.getObjectById(this.memory.wall)
    if (!wall) {
        var walls = this.room.find(FIND_STRUCTURES, { filter: w => (w.structureType == STRUCTURE_WALL || w.structureType == STRUCTURE_RAMPART) && w.pos.findInRange(FIND_SOURCES,1).length == 0 && w.hits < w.hitsMax / 0.8 })
        if (walls.length > 1) walls.sort((a, b) => a.hits - b.hits)
        if (!walls[0]) return false
        else {
            this.memory.wall = walls[0].id
            this.memory.wallm = walls[0].hits + this.getActiveBodyparts(CARRY) * 50000
        }
    }
    if (wall) {
        // this.say('repairwall')
        if (!this.memory.wallm) return this.memory.wall = null
        else if (wall.hits < this.memory.wallm) {
            var f = this.repair(wall)
            if (f == nir) {
                if (this.memory.no_pull) this.memory.no_pull = false;
                return this.moveTo(wall)
            } else if (f == OK) {
                if (!this.memory.no_pull) this.memory.no_pull = true;
            }
            return f
        } else if (wall.hits >= this.memory.wallm) this.memory.wall = null
    }
    return false
}
Creep.prototype.next = function () {
    return
    if (this.spawning || !this.memory.workType || this.ticksToLive > 150) return false
    if(!this.memory.nextName){
        this.memory.nextName = randomName();
    }else{
        var nextCreep = Game.creeps[this.memory.nextName]
        if(!nextCreep){
            console.log('提前生产爬爬:',this.memory.nextName,this.memory.workType)
            var spawn = getSpawn(this.room.name)
            if (spawn && !spawn.spawning) {
                var type = this.memory.workType
                var body = []
                var room = this.room
                var level = Memory.rooms[room.name]['level']
                switch(type.split('/')[2]){
                    case 'source':
                        if (level != 8) body = creepbody([CARRY, WORK, WORK, MOVE], [WORK, WORK, MOVE], room, 10)
                        else body = creepbody([CARRY], [WORK, WORK, MOVE], room, 16)
                        break
                    case 'carry':
                        if (level <= 2) {
                            if (room.energyAvailable < 300) body = [CARRY, CARRY, MOVE, MOVE]
                            else body = creepbody([CARRY, MOVE], [CARRY, MOVE], room, 10)
                        } else if (level <= 4) {
                            if (room.energyAvailable < 750) body = [CARRY, CARRY, MOVE]
                            else body = creepbody([CARRY, CARRY, MOVE], [CARRY, CARRY, MOVE], room, 15)
                        } else {
                            if (room.energyAvailable < 1500) body = [CARRY, CARRY, MOVE]
                            else body = creepbody([CARRY, CARRY, MOVE], [CARRY, CARRY, MOVE], room, 30)
                        }
                        break

                }
                spawn.spawnCreep(body, this.memory.nextName,{memory:this.memory})
            }
        }else if(!nextCreep.spawning){
            var arr = Object.values(Memory.rooms[this.room.name]['creeps']['work_' + this.memory.workType.split('/')[2]]['name'])
            if(arr.indexOf(this.memory.nextName) == -1){
                var i1 = arr.indexOf(this.memory.workType)
                Memory.rooms[this.room.name]['creeps']['work_' + this.memory.workType.split('/')[2]]['name'].push(this.memory.nextName)
                arr = Object.values(Memory.rooms[this.room.name]['creeps']['work_' + this.memory.workType.split('/')[2]]['name'])
                var i2 = arr.length - 1;
                [arr[i1],arr[i2]] = [arr[i2],arr[i1]]
                Memory.rooms[this.room.name]['creeps']['work_' + this.memory.workType.split('/')[2]]['name'] = arr
            }else{
                this.dead()
                return true
            }
        }
    }
    return false
}
Creep.prototype.transferStorage = function(){
    if(this.store.getUsedCapacity() > 0){
        var storage = this.room.storage
        if(!storage)return false
        var type = Object.keys(this.store)[0]
        if(type != e){
            if(this.memory.no_pull)this.memory.no_pull = false
            if(this.transfer(storage,type) == nir)this.moveTo(storage)
            return true
        }
    }
    return false
}
const chat1 = [
    ['你们这战斗力,我建议','你们还是投降算了'],
    ['像英雄一样战斗','或者','像懦夫一样死去!'],
    ['那拿枪的海盗','是记忆里的核心','浩空的流星','在我脑海闪过'],
    ['你的遗体将慢慢消散','化为永恒','就像沙漠中的沙砾一样'],
    ['我总是那么让你担心','是不是你永远都会变成它','守护在我的身旁'],
    ['物是人韭','可我依旧穿着嫁衣','在黑夜中寻找你的身影'],
    ['那一张张卡牌上','都写满了你的名字','我总是告诉自我','哪一张没有你的名字'],
    ['我仅有飞速的旋转','才能够止住我的泪水','忘记你的摸样'],
    ['化为灰烬','呵呵','就是他们的宿命'],
    ['你要来一发吗','你看样子好像快不行了'],
    ['和公牛角力','你会尝到牛角的滋味的'],
    ['俺很生气','后果很严重！'],
    ['只有傻瓜才会想着','要怎么打我抽到的手牌'],
    ['面对疾风吧！','哈撒给'],
    ['我会为了理想而战','但不会因此','丢掉性命'],
    ['对于我这种人来说','财富','也是一种负担'],
    ['另一场战争','要给点小费'],
    ['绝对不要','低估斥候戒律的威力'],
    ['若想解决纷争','必先陷入纷争！'],
    ['我没有大脑','但很快你也会没有！'],
    ['我有一只小雪人','我一直都在骑'],
    ['别把雪人给惹恼了','否则你就完蛋了!'],
    ['敌人不见了要说一声啦','敢不敢不坑爹'],
    ['只要我还活着','就不会有人遭受苦难'],
    ['大千世界','皆处在平衡之中'],
    ['邪恶的黑暗力量','再次消失吧','永远不能复活'],
    ['我们再来一次','这一次','好好来'],
    ['希望那些我没有做到的','可以让你做得更好'],
    ['梦想不多，兜里有糖','肚里有墨，手里有活','卡里有钱，心里有你','足矣~'],
    ['我的心是颗冰糖山楂','甜也为你，酸也为你','能一口咬上来吗','然后我好偷偷抱紧'],
    ['你可以教我煮汤圆吗','我很笨','怎么煮都会露馅','喜欢你也是。'],
    ['合适的鞋，只有脚知道','合适的人，只有心知道','走千条路，只一条适合','遇万般人，得一人足够'],
    ['你是远方的风景','我是游走的旅人','我翻山越岭长途跋涉','只为看你一眼。'],
    ['我要住进你的眼里','十二个月，月月沦陷','周而复始，生生不换'],
    ['你值得我珍藏一生', '疯狂我整个青春'],
    ['山水一程' ,'风雨一更', '三生有幸' ,'共度余生'],
    ['你是我温暖的手套','冰冷的啤酒','带着阳光味道的衬衫','日复一日的梦想'],
    ['用思念做一盏盏灯','放在你回家必经的路旁','用微笑做一颗颗星','挂在你甜美走过的天空'],
    ['遇总是点点头','想说总是难开口','视线相交的一瞬间','我已感觉到你的温柔'],
    ['这个bot','是大猫猫的哦'],
    ['跟我一起学猫叫','一起喵喵喵喵喵'],
]
Creep.prototype.chat = function(){
    if(Game.time % Math.max(Math.floor((100 + Math.random() * creepCount * 11),Math.random()* 50 + 100)) && this.memory.chatNum == -1)return 
    if(this.memory.chatNum == -1){
        this.memory.chatNum = Math.floor(Math.random() * chat1.length)
        this.memory.chatNext = 0;
    }else{
        var str1 = chat1[this.memory.chatNum]
        if(!str1)return this.memory.chatNum = -1
        if(this.memory.chatNext >= str1.length){
            this.memory.chatNum = -1
        }else{
            var str2 = str1[this.memory.chatNext]
            if(str2){
                this.say(str2,true)
                this.memory.chatNext = this.memory.chatNext + 1
            }
        }
    }
}
Creep.prototype.maskController = function(controller){
    var f = this.signController(controller, Memory.playerName)
    if(f == OK)return true
    this.moveTo(controller)
    return false
}

Room.prototype.findEnemys = function(){
    return this.find(FIND_HOSTILE_CREEPS, { filter: s => Memory.whiteList.indexOf(s.owner.username) == -1 })
}
//对穿
var config = {
    changemove: true,//实现对穿
    changemoveTo: true,//优化moveTo寻路默认使用ignoreCreep=true
    roomCallbackWithoutCreep: undefined,//moveTo默认使用的忽视creep的callback函数
    roomCallbackWithCreep: undefined,//moveTo默认使用的计算creep体积的callback函数
    changeFindClostestByPath: false,  //修改findClosestByPath 使得默认按照对穿路径寻找最短
    reusePath: 10 //增大默认寻路缓存
}
if (config.changemove) {
    // Store the original method
    let move = Creep.prototype.move;
    // Create our new function
    Creep.prototype.move = function (target) {
        // target可能是creep（在有puller的情况下），target是creep时pos2direction返回undefined
        const tarpos = pos2direction(this.pos, target);
        if (tarpos) {
            let direction = +target;
            const tarcreep = tarpos.lookFor(LOOK_CREEPS)[0] || tarpos.lookFor(LOOK_POWER_CREEPS)[0]
            if (tarcreep && this.ignoreCreeps) {
                if (tarcreep.my && !tarcreep.memory.no_pull) {
                    // 挡路的是我的creep/powerCreep, 如果它本tick没移动则操作它对穿
                    if (!tarcreep.moved && move.call(tarcreep, (direction + 3) % 8 + 1) == ERR_NO_BODYPART) {
                        // 如果对方是个没有脚的球
                        if (this.pull) {
                            // 自己是creep, 就pull他一下 （powerCreep没有pull方法，会堵车）
                            this.pull(tarcreep);
                            move.call(tarcreep, this);
                        }
                    }
                } else if (Game.time & 1 && this.memory._move && this.memory._move.dest) {
                    // 别人的creep，如果在Memory中有正在reuse的路径（即下一tick本creep还会尝试同样移动），则1/2概率清空路径缓存重新寻路
                    let dest = this.memory._move.dest;
                    let pos = new RoomPosition(dest.x, dest.y, dest.room);
                    if (pos.x != tarpos.x || pos.y != tarpos.y || pos.roomName != tarpos.roomName) {
                        // 如果最终目标位置不是当前这一步移动的目标位置（如果是的话绕路也没用）
                        let path = this.pos.findPathTo(pos);
                        if (path.length) {
                            this.memory._move.time = Game.time;
                            this.memory._move.path = Room.serializePath(path);
                            return move.call(this, path[0].direction);
                        }
                    }
                }
            }
        }

        this.moved = true;
        return move.call(this, target);
    }

    PowerCreep.prototype.move = function (target) {
        if (!this.room) {
            return ERR_BUSY;
        }
        return Creep.prototype.move.call(this, target);
    }
}

if (config.changemoveTo) {
    let moveTo = Creep.prototype.moveTo;
    Creep.prototype.moveTo = function (firstArg, secondArg, opts) {
        let ops = {};
        if (_.isObject(firstArg)) {
            ops = secondArg || {};
        } else {
            ops = opts || {};
        }
        if (!ops.reusePath) {
            ops.reusePath = config.reusePath;
        }
        if (ops.ignoreRoads) {
            ops.plainCost = 1;
            ops.swampCost = 5;
        } else if (ops.ignoreSwanp) {
            ops.plainCost = 1;
            ops.swampCost = 1;
        }
        if (ops.ignoreCreeps === undefined || ops.ignoreCreeps === true) {
            this.ignoreCreeps = true;
            ops.ignoreCreeps = true;
            ops.costCallback = config.roomCallbackWithoutCreep;
        } else {
            ops.costCallback = config.roomCallbackWithCreep;
        }

        if (_.isObject(firstArg)) {
            return moveTo.call(this, firstArg, ops);
        } else {
            return moveTo.call(this, firstArg, secondArg, ops);
        }
    }

    PowerCreep.prototype.moveTo = function (firstArg, secondArg, opts) {
        if (!this.room) {
            return ERR_BUSY;
        }
        let ops = {};
        if (_.isObject(firstArg)) {
            ops = secondArg || {};
        } else {
            ops = opts || {};
        }
        if (!ops.reusePath) {
            ops.reusePath = config.reusePath;
        }
        ops.plainCost = 1;
        ops.swampCost = 1;
        if (_.isObject(firstArg)) {
            return moveTo.call(this, firstArg, ops)
        } else {
            return moveTo.call(this, firstArg, secondArg, ops)
        }
    }
}

if (config.changeFindClostestByPath) {
    let origin_findClosestByPath = RoomPosition.prototype.findClosestByPath;
    RoomPosition.prototype.findClosestByPath = function (type, opts) {
        opts = opts || {};
        if (opts.ignoreCreeps === undefined || opts.ignoreCreeps === true) {
            opts.ignoreCreeps = true;
            opts.costCallback = config.roomCallbackWithoutCreep;
        } else {
            opts.costCallback = config.roomCallbackWithCreep;
        }
        return origin_findClosestByPath.call(this, type, opts);
    }
}

function pos2direction(pos, target) {
    if (_.isObject(target)) {
        // target 不是方向常数
        return undefined;
    }

    const direction = +target;  // 如果是string则由此运算转换成number
    let tarpos = {
        x: pos.x,
        y: pos.y,
    }
    if (direction !== 7 && direction !== 3) {
        if (direction > 7 || direction < 3) {
            --tarpos.y
        } else {
            ++tarpos.y
        }
    }
    if (direction !== 1 && direction !== 5) {
        if (direction < 5) {
            ++tarpos.x
        } else {
            --tarpos.x
        }
    }
    if (tarpos.x < 0 || tarpos.y > 49 || tarpos.x > 49 || tarpos.y < 0) {
        return undefined;
    } else {
        return new RoomPosition(tarpos.x, tarpos.y, pos.roomName);
    }
}

function tips(text,tipStrArray,id,left){
    left = left-1;
    left*=100;
    let showCore = tipStrArray.map(e=>`<t onclick="goto('${e}')"> ${e} </t>`.replace(/[\\"]/g,'%')).join("<br>")
    let time = Game.time;
return `<t class="a${id}-a${time}">${text}</t><script>
function goto(e){
    let roomName = e.split(":")[0].replace(/\\s+/g, "");
    window.location.href = window.location.href.substring(0,window.location.href.lastIndexOf("/")+1)+roomName;
};
(() => {
    const button = document.querySelector(".a${id}-a${time}");
    let tip;
    button.addEventListener("pointerenter", () => {
        tip = document.createElement("div");
        tip.style.backgroundColor = "rgba(43,43,43,1)"; 
        tip.style.border = "1px solid";
        tip.style.borderColor = "#ccc";
        tip.style.borderRadius = "5px";
        tip.style.position = "absolute";
        tip.style.zIndex=10;
        tip.style.color = "#ccc";
        tip.style.marginLeft = "${left}px";
        tip.width = "230px";
        tip.innerHTML = "${showCore}".replace(/[\\%]/g,'"'); button.append(tip);
    });
    button.addEventListener("pointerleave", () => {tip && (tip.remove(), tip = undefined);});
    })()
</script>
`.replace(/[\r\n]/g, "");
}


const showBigCatCatHelp ={
    控制台 : '大猫bot目前需要通过手动插旗子添加房间[具体操作看roomHelp - 旗子]\n会自动开外矿,目前还没有主防,多房间时会自动平衡较多的资源\n有rampart时,被打爆或者快爆了就会自动开sf()\n到8级会挖过道,或者九房[还没写]\n目前很多功能还未完善或还没写\n\n'
    +'控制台输入以下代码以获取具体操作:\n'
    +'  playerHelp     :   对玩家的操作\n'
    +'  shardHelp      :   对shard的操作\n'
    +'  roomHelp       :   对房间的操作\n'
    +'  creepHelp      :   对爬爬的操作\n'
    +'  marketHelp     :   对市场的操作[还没写]\n'
    ,player:'玩家信息:\n'
    +'  showPlayer()                    获取玩家当前信息\n'
    +'  whiteList.show()                 获取白名单信息\n'
    +'  whiteList.add(playerName)        添加白名单\n'
    +'  whiteList.delete(playerName)     删除白名单\n'
    ,shard:'shard操作:\n'
    +'  shard.showAllRoom()                 获取玩家此shard所有房间信息                           点击房间名字 可以跳转至此房间\n'
    +'  shard.showAllResource()             显示后 鼠标放在资源上面会显示全部自己房间的资源         点击房间 可以跳转到房间      63的轮子\n'
    +'  shard.showAllCreepTask()            获取爬爬任务信息\n'
    +'  shard.showAllCreepUsedCpu()         获取所有爬爬CPU消耗\n'
    ,room:'房间操作:\n'
    +'[控制台输入]\n'
    +'  room.jumpTo(roomName)                       跳转房间\n'
    +'  room.openPowerSpawnWork(roomName)           房间开启骚抛瓦                     开启骚抛瓦的话没抛瓦会自动关闭\n'
    +'  room.closePowerSpawnWork(roomName)          房间关闭骚抛瓦\n'
    +'  room.ALLopenPowerSpawnWork()                所有房间开启骚抛瓦                 开启骚抛瓦的话没抛瓦会自动关闭\n'
    +'  room.ALLclosePowerSpawnWork()               所有房间关闭骚抛瓦\n'

    +'  room.addOutEnergy(roomName,targetName)      指定房间增加外矿                    roomName自己的某个房间名字                          targetName某个外矿的房间名字\n'
    +'  room.deleteOutEnergy(roomName,targetName)   指定房间删除外矿                    roomName自己的某个房间名字                          targetName某个外矿的房间名字\n'
    +'  room.addAisle(roomName,targetName)          指定房间增加过道                    roomName自己的某个房间名字                          targetName某个过道的房间名字\n'
    +'  room.deleteAisle(roomName,targetName)       指定房间删除过道                    roomName自己的某个房间名字                          targetName某个过道的房间名字\n'
    
    +'  room.changeRoomCreepNum(roomName,type,num)  改变房间内某类爬爬的基础数量        目前可用爬类[up,build,carry,harvest,wall,defend]    房间升级后会更新为默认值\n'
    +'  room.oneWorkCreepUp(roomName)               指定房间 开启/关闭 1work爬升级控制器      roomName自己的某个房间名字\n'
    +'  room.allOpenOneWorkCreepUp()                所有房间 开启 1work爬升级控制器\n'
    +'  room.allCloseOneWorkCreepUp()               所有房间 关闭 1work爬升级控制器\n'
    +'[旗子]\n'
    +'  添加房间:addRoom                             插在第一个核心的下面俩格(spawn.pos.x,spawn.pos.y + 2)这里，然后旗子会自己移除\n'
    +'  删除房间:deleteRoom                          插在房间内即可\n'
    +'  显示房间布局:visual	                         插房间内即可\n'
    +'  删除房间内建筑:deleteRoomBuild/[type]        插要拆除的建筑上(填建筑类型){road,extension,tower,spawn,wall,rampart,nuker,powerSpawn,terminal,observer,storage,container,link,factory,lab}\n'
    ,creep:'爬爬操作:[插旗帜][旗子名字格式最后的X可以是任意字符,因为旗子名字唯一,避免多个相同任务创建不了]\n'
    +'旗子格式:[roomName:从自己的哪个房间生产爬并出发]/xxx/xxx\n'
    +'  占领空房间:roomName/claim/X             插目标房间内即可,如果已经有人占了会一直出爬打控制器         [E17S57/claim/0]\n'
    +'  援建:\n'
    +'      对自己:roomName/help/buildMy/X      插自己房间内即可,挖目标房间内的能量             [E17S57/help/buildMy/0]\n'
    +'      送能量:roomName/help/energy/X       插目标房间内即可,来回运送能量                   [E17S57/help/energy/0]\n'
    +'  攻击:\n'
    +'      一体机:\n'
    +'          roomName/ATK/attack/X           插目标房间内即可,出红球一体机,优先攻击旗子下的建筑,没有就自动找目标         [E17S57/ATK/attack/0]\n'
    +'          roomName/ATK/claim/X            插目标房间内即可,出紫球,攻击目标房间控制器[不会占领,打完了自动预定]         E17S57/ATK/claim/0]\n'
    ,market:'市场操作:\n'
    +'查看 '+Memory.playerName+' 在市场里创建的订单的状态:\n'
    +'      market.show()\n'
    +'买东西:\n'
    +'      挂单:market.buy(roomName,type,amount)\n'
    +'      直接买:market.dealBuy(roomName,type,amount)\n'
    +'卖东西:\n'
    +'      挂单:market.sell(roomName,type,amount)\n'
    +'      直接买:market.dealSell(roomName,type,amount)\n'
    +'修改订单:\n'
    +'      增加数量:market.extend(id,amount)\n'
    +'      变化价格:market.changePrice(id,amount)\n'
}
//玩家
const showPlayer = function(){
    showPlayerBool = true;
    return '正在获取玩家信息...'
}
//白名单
let whiteList = {
    show(){
        for(var playerName of Memory.whiteList){
            console.log(playerName)
        }
        return '白名单人数:' + Memory.whiteList.length
    },
    add(playerName){
        if (Memory.whiteList.indexOf(playerName) != -1) return '白名单已有 ' + playerName
        else {
            Memory.whiteList[Memory.whiteList.length] = playerName
            return '白名单新增 ' + playerName
        }
    },
    delete(playerName){
        let i = Memory.whiteList.indexOf(playerName)
        if (i == -1) return '白名单里没有 '+ playerName+' 这名字'
        else {
            Memory.whiteList.splice(i,1)
            return '白名单已删除 ' + playerName
        }
    }
}
//shard
let show = {
    getStorageTerminalRes:function (room){
        let store = {};
        if(room.storage)show.addStore(store,room.storage.store)
        if(room.terminal)show.addStore(store,room.terminal.store)
        if(room.factory)show.addStore(store,room.factory.store)
        return store
    },
    addStore:(store,b)=> {for(let v in b) if(b[v]>0)store[v]=(store[v]||0)+b[v];return store},
    showAllRoom(){
        showAllRoomBool = true;
        return '正在获取房间信息...'
    },
    showAllCreepTask(){
        showAllCreepTaskBool = true
        return '正在获取爬爬任务信息...'
    },
    showAllCreepUsedCpu(){
        showAllCreepUsedCpuBool = true
        return '正在获取爬爬CPU消耗...'
    },
    showAllResource(){

        let rooms = _.values(Game.rooms).filter(e=>e.controller&&e.controller.my&&(e.storage||e.terminal));
        let roomResAll = rooms.map(e=>[e.name,show.getStorageTerminalRes(e)]).reduce((map,entry)=>{map[entry[0]] = entry[1];return map},{})


        let all = rooms.reduce((all, room)=> show.addStore(all,roomResAll[room.name]),{});


        let time = Game.cpu.getUsed()
        let base = [RESOURCE_ENERGY,"U","L","K","Z","X","O","H",RESOURCE_POWER,RESOURCE_OPS]
        // 压缩列表
        let bars = [RESOURCE_BATTERY,RESOURCE_UTRIUM_BAR,RESOURCE_LEMERGIUM_BAR,RESOURCE_KEANIUM_BAR,RESOURCE_ZYNTHIUM_BAR,RESOURCE_PURIFIER,RESOURCE_OXIDANT,RESOURCE_REDUCTANT,RESOURCE_GHODIUM_MELT]
        // 商品
        let c_grey =[RESOURCE_COMPOSITE,RESOURCE_CRYSTAL,RESOURCE_LIQUID]
        let c_blue = [RESOURCE_DEVICE,RESOURCE_CIRCUIT,RESOURCE_MICROCHIP,RESOURCE_TRANSISTOR,RESOURCE_SWITCH,RESOURCE_WIRE,RESOURCE_SILICON].reverse()
        let c_yellow=[RESOURCE_MACHINE,RESOURCE_HYDRAULICS,RESOURCE_FRAME,RESOURCE_FIXTURES,RESOURCE_TUBE,RESOURCE_ALLOY,RESOURCE_METAL].reverse()
        let c_pink = [RESOURCE_ESSENCE,RESOURCE_EMANATION,RESOURCE_SPIRIT,RESOURCE_EXTRACT,RESOURCE_CONCENTRATE,RESOURCE_CONDENSATE,RESOURCE_MIST].reverse()
        let c_green =[RESOURCE_ORGANISM,RESOURCE_ORGANOID,RESOURCE_MUSCLE,RESOURCE_TISSUE,RESOURCE_PHLEGM,RESOURCE_CELL,RESOURCE_BIOMASS].reverse()
        // boost
        let b_grey =["OH","ZK","UL","G"]
        let gent =  (r)=> [r+"H",r+"H2O","X"+r+"H2O",r+"O",r+"HO2","X"+r+"HO2"]
        let b_blue = gent("U")
        let b_yellow=gent("Z")
        let b_pink = gent("K")
        let b_green =gent("L")
        let b_withe =gent("G")


        let formatNumber=function (n) {
            var b = parseInt(n).toString();
            var len = b.length;
            if (len <= 3) { return b; }
            var r = len % 3;
            return r > 0 ? b.slice(0, r) + "," + b.slice(r, len).match(/\d{3}/g).join(",") : b.slice(r, len).match(/\d{3}/g).join(",");
        }
        let str = ""
        let colorMap = {
            [RESOURCE_ENERGY]:"rgb(255,242,0)",
            "Z":"rgb(247, 212, 146)",
            "L":"rgb(108, 240, 169)",
            "U":"rgb(76, 167, 229)",
            "K":"rgb(218, 107, 245)",
            "X":"rgb(255, 192, 203)",
            "G":"rgb(255,255,255)",
            [RESOURCE_BATTERY]:"rgb(255,242,0)",
            [RESOURCE_ZYNTHIUM_BAR]:"rgb(247, 212, 146)",
            [RESOURCE_LEMERGIUM_BAR]:"rgb(108, 240, 169)",
            [RESOURCE_UTRIUM_BAR]:"rgb(76, 167, 229)",
            [RESOURCE_KEANIUM_BAR]:"rgb(218, 107, 245)",
            [RESOURCE_PURIFIER]:"rgb(255, 192, 203)",
            [RESOURCE_GHODIUM_MELT]:"rgb(255,255,255)",
            [RESOURCE_POWER]:"rgb(224,90,90)",
            [RESOURCE_OPS]:"rgb(224,90,90)",
        }
        let id = 0
        let addList = function (list,color){
            let uniqueColor = function (str,resType){
                if(colorMap[resType])str="<font style='color: "+colorMap[resType]+";'>"+str+"</font>"
                return str
            }
            if(color)str+="<div style='color: "+color+";'>"
            let left = 0
            let getAllRoom = function (text,resType){
                let arr = []
                for(let roomName in roomResAll){
                    arr.push(_.padLeft(roomName,6)+":"+_.padLeft(formatNumber(roomResAll[roomName][resType]||0),9))
                }
                id+=1
                left+=1
                return tips(text,arr,id,left)
            }
            list.forEach(e=>str+=getAllRoom(uniqueColor(_.padLeft(e,15),e),e));str+="<br>";
            list.forEach(e=>str+=uniqueColor(_.padLeft(formatNumber(all[e]||0),15),e));str+="<br>";
            if(color)str+="</div>"
        }
        str+="<br>基础资源:<br>"
        addList(base)
        str+="<br>压缩资源:<br>"
        addList(bars)
        str+="<br>商品资源:<br>"
        addList(c_grey)
        addList(c_blue,"rgb(76, 167, 229)")
        addList(c_yellow,"rgb(247, 212, 146)")
        addList(c_pink,"rgb(218, 107, 245)")
        addList(c_green,"rgb(108, 240, 169)")
        str+="<br>LAB资源:<br>"
        addList(b_grey)
        addList(b_blue,"rgb(76, 167, 229)")
        addList(b_yellow,"rgb(247, 212, 146)")
        addList(b_pink,"rgb(218, 107, 245)")
        addList(b_green,"rgb(108, 240, 169)")
        addList(b_withe,"rgb(255,255,255)")
        console.log(str)

        return "Game.cpu.used:"+(Game.cpu.getUsed() - time)
    },
}
//room
const typeAll = ['up','build','carry','harvest','wall','defend']
let roomChange = {
    jumpTo(roomName){
        return jumpToRoom(roomName,'跳转',0)
    },
    changeRoomCreepNum(roomName,type,num){
        if(typeAll.indexOf(type) == -1)return '目前不支持该类型的爬'
        if(type == 'harvest')type = 'source'
        Memory.rooms[roomName]['creeps']['work_' + type]['num'] = num
        return roomName + ' 房间内 ' + type + ' 类爬数量更改为 ' + num
    },
    openPowerSpawnWork(roomName){
        Memory.rooms[roomName]['openPowerSpawnWork'] = true
        return roomName + ' 开启自动骚抛瓦'
    },
    closePowerSpawnWork(roomName){
        Memory.rooms[roomName]['openPowerSpawnWork'] = false
        return roomName + ' 关闭自动骚抛瓦'
    },
    ALLopenPowerSpawnWork(){
        for(var roomName in Memory.rooms){
            if(Memory.rooms[roomName]){
                Memory.rooms[roomName]['openPowerSpawnWork'] = true
            }
        }
        return '所有房间已开启自动骚抛瓦'
    },
    ALLclosePowerSpawnWork(){
        for(var roomName in Memory.rooms){
            if(Memory.rooms[roomName]){
                Memory.rooms[roomName]['openPowerSpawnWork'] = false
            }
        }
        return '所有房间已关闭自动骚抛瓦'
    },
    addOutEnergy(roomName,targetName){
        if(!Memory.rooms[roomName])return '没有占领这个房间'
        if(Memory.rooms[targetName])return '外矿就是你的房间了，不需要开'
        var outEnergy = Memory.rooms[roomName]['out_energy']
        if(outEnergy[targetName])return '此房间已有此外矿'
        Memory.rooms[roomName]['out_energy'][targetName] = {}
        Memory.rooms[roomName]['out_energy_ob'] = false
        return roomName + '增加外矿 => ' + targetName 
    },
    deleteOutEnergy(roomName,targetName){
        if(!Memory.rooms[roomName])return '没有占领这个房间'
        var outEnergy = Memory.rooms[roomName]['out_energy']
        if(!outEnergy[targetName])return '此房间已无此外矿'
        delete Memory.rooms[roomName]['out_energy'][targetName]
        return roomName + '删除外矿 => ' + targetName 
    },
    addAisle(roomName,targetName){
        if(!Memory.rooms[roomName])return '你没有占领这个房间'
        if(Memory.rooms[targetName])return '过道错误'
        if(!Memory.rooms[roomName]['aisle']['open'])return '此房间没用开通过道任务'
        var aisles = Memory.rooms[roomName]['aisle']['outName']
        if(aisles.indexOf(targetName) != -1)return '此房间已有此过道'
        var s = getIntArr(targetName).split('0');
        if(s.length >= 2){
            Memory.rooms[roomName]['aisle']['outName'].push(targetName)
            return roomName + '增加过道 => ' + targetName 
        }else return '错误过道'
    },
    deleteAisle(roomName,targetName){
        if(!Memory.rooms[roomName])return '你没有占领这个房间'
        var aisles = Memory.rooms[roomName]['aisle']['outName']
        var s = aisles.indexOf(targetName)
        if(s == -1)return '此房间已无此过道'
        Memory.rooms[roomName]['aisle']['outName'].splice(s,1)
        return roomName + '删除过道 => ' + targetName 
    },
    oneWorkCreepUp(roomName){
        if(!Memory.rooms[roomName])return '缓存内无此房间'
        if (!Memory.rooms[roomName]['oneWorkCreepUp']) {
            Memory.rooms[roomName]['oneWorkCreepUp'] = true
            return roomName + ' 已开启1work爬升级模式'
        } else {
            Memory.rooms[roomName]['oneWorkCreepUp'] = false
            return roomName + ' 已关闭1work爬升级模式'
        }
    },
    allOpenOneWorkCreepUp(){
        for(var roomName in Memory.rooms){
            Memory.rooms[roomName]['oneWorkCreepUp'] = true
        }
        return '[shard:' + Game.shard.name + ']所有房间已开启1work爬升级模式'
    },
    allCloseOneWorkCreepUp(){
        for(var roomName in Memory.rooms){
            Memory.rooms[roomName]['oneWorkCreepUp'] = false
        }
        return '[shard:' + Game.shard.name + ']所有房间已关闭1work爬升级模式'
    },

}
//market
let marketChange ={
    show : function(){

    }
}
let helpFunction = '大猫bot使用说明:\n' + showBigCatCatHelp.控制台
global.shard = show;
global.room = roomChange;
global.help = helpFunction;
global.playerHelp = showBigCatCatHelp.player
global.shardHelp = showBigCatCatHelp.shard
global.roomHelp = showBigCatCatHelp.room
global.creepHelp = showBigCatCatHelp.creep
global.marketHelp = showBigCatCatHelp.market
global.market = marketChange
global.showPlayer = showPlayer
global.whiteList = whiteList
let a = Game.shard.name
if(sifu)a = ',检测到是私服' + a
console.log('代码上传成功' + a)