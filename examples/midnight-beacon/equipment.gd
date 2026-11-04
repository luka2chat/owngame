extends RefCounted
## Voyage-local inventory. Base combat stats are never overwritten by gear.
const SLOTS = ["LANTERN", "HAT", "COAT", "BOOTS", "RING", "CHARM"]
const NAMES = ["Watchfire", "Mistkeeper", "Stormcoat", "Tidewalk", "Sea Glass", "Northstar"]
const QUALITIES = ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"]
const COLORS = [Color("a9c4c9"), Color("78d8ad"), Color("8fbdf4"), Color("e8bb6b")]
const MAIN = ["power", "health", "armor", "speed", "crit", "magnet"]
const VALUES = {"power":8.0, "health":12.0, "armor":1.0, "speed":5.0, "crit":3.0, "magnet":8.0, "haste":3.0, "regen":0.15}
const LABELS = {"power":"Lantern damage", "health":"Maximum health", "armor":"Damage reduction", "speed":"Move speed", "crit":"Critical chance", "magnet":"Pickup range", "haste":"Attack speed", "regen":"Health / second"}
const CAPACITY = 24
var items: Array = []
var worn: Dictionary = {}
var dust := 12
var next_id := 1

func reset() -> void:
 items.clear(); worn.clear(); dust = 12; next_id = 1
 var random = RandomNumberGenerator.new()
 random.seed = 177
 for slot in [0,2,3,4]:
  var item = create_item(slot, 1 if slot == 4 else 0, 1, random)
  items.append(item)
  if slot in [0,2]: worn[str(slot)] = item.id

func create_item(slot: int, quality: int, item_level: int, random: RandomNumberGenerator) -> Dictionary:
 var bonuses = {}
 var pool = VALUES.keys()
 pool.erase(MAIN[slot])
 for i in range(mini(quality, 3)):
  var pick = pool[random.randi_range(0, pool.size()-1)]
  pool.erase(pick)
  bonuses[pick] = snappedf(float(VALUES[pick]) * random.randf_range(0.7,1.1),0.01)
 var item = {"id":next_id,"slot":slot,"quality":quality,"level":clampi(item_level,1,100),"upgrade":0,"affixes":bonuses}
 next_id += 1
 return item

func find_item(id: int) -> Dictionary:
 for item in items:
  if int(item.id) == id: return item
 return {}

func equipped(item: Dictionary) -> bool:
 return int(worn.get(str(int(item.slot)),-1)) == int(item.id)

func stats(item: Dictionary) -> Dictionary:
 if item.is_empty(): return {}
 var multiplier = (1.0 + (int(item.level)-1)*0.08) * (1.0 + int(item.quality)*0.3) * (1.0 + int(item.upgrade)*0.15)
 var result = item.affixes.duplicate()
 var main = MAIN[int(item.slot)]
 result[main] = VALUES[main]
 for key in result: result[key] = snappedf(result[key] * multiplier, 0.01)
 if int(item.quality) == 3: result["siphon"] = 1.0
 return result

func totals() -> Dictionary:
 var result = {}
 for id in worn.values():
  for key in stats(find_item(int(id))):
   result[key] = float(result.get(key,0)) + stats(find_item(int(id)))[key]
 return result

func score(item: Dictionary) -> int:
 var weight = {"power":5,"health":1,"armor":12,"speed":3,"crit":7,"magnet":2,"haste":7,"regen":50,"siphon":100}
 var result = 0.0
 for key in stats(item): result += stats(item)[key] * weight[key]
 return roundi(result)

func equip(id: int) -> bool:
 var item = find_item(id)
 if item.is_empty(): return false
 var key = str(int(item.slot))
 if equipped(item): worn.erase(key)
 else: worn[key] = id
 return true

func cost(item: Dictionary) -> int:
 return (int(item.upgrade)+1)*6 + int(item.quality)*3

func improve(id: int) -> bool:
 var item = find_item(id)
 if item.is_empty() or int(item.upgrade)>=5 or dust<cost(item): return false
 dust -= cost(item); item.upgrade = int(item.upgrade)+1
 return true

func salvage_value(item: Dictionary) -> int:
 return 3 + int(item.quality)*4 + int(item.upgrade)*3

func salvage(id: int) -> bool:
 var item = find_item(id)
 if item.is_empty() or equipped(item): return false
 dust += salvage_value(item); items.erase(item)
 return true

func reward(stage: int, random: RandomNumberGenerator) -> Dictionary:
 var roll = random.randf()
 var quality = 3 if roll<minf(0.20,0.04+stage*0.008) else (2 if roll<0.40 else 1)
 var item = create_item(random.randi_range(0,5),quality,stage,random)
 dust += 5 + mini(stage,50)
 if items.size() >= CAPACITY:
  # Never discard equipped items: weakest of incoming and backpack is recycled.
  var weakest = item
  for candidate in items:
   if not equipped(candidate) and score(candidate)<score(weakest): weakest=candidate
  if weakest==item:
   dust += salvage_value(item)
   return {"recycled":true,"item":item}
  salvage(int(weakest.id))
 items.append(item)
 return {"recycled":false,"item":item}

func snapshot() -> Dictionary:
 return {"version":1,"items":items.duplicate(true),"worn":worn.duplicate(),"dust":dust,"next_id":next_id}

func integer(value: Variant, lo: int, hi: int) -> bool:
 return (value is int or value is float) and is_finite(float(value)) and float(value)==floor(float(value)) and value>=lo and value<=hi

func valid(data: Variant) -> bool:
 if not data is Dictionary or data.get("version") != 1: return false
 if not data.get("items") is Array or data.items.size()>CAPACITY or not data.get("worn") is Dictionary: return false
 if not integer(data.get("dust"),0,1000000000) or not integer(data.get("next_id"),1,1000000000): return false
 var ids = {}
 for item in data.items:
  if not item is Dictionary: return false
  for spec in [["id",1,999999999],["slot",0,5],["quality",0,3],["level",1,100],["upgrade",0,5]]:
   if not integer(item.get(spec[0]),spec[1],spec[2]): return false
  if ids.has(int(item.id)) or item.id>=data.next_id or not item.get("affixes") is Dictionary: return false
  ids[int(item.id)] = int(item.slot)
  if item.affixes.size()!=int(item.quality): return false
  for key in item.affixes:
   if not VALUES.has(key) or key==MAIN[int(item.slot)]: return false
   var v = item.affixes[key]
   if not (v is int or v is float) or not is_finite(float(v)) or v<0 or v>VALUES[key]*1.11: return false
 for slot in data.worn:
  if not slot in ["0","1","2","3","4","5"]: return false
  var id = data.worn[slot]
  if not integer(id,1,999999999) or not ids.has(int(id)) or ids[int(id)]!=int(slot): return false
 return true

func restore(data: Variant) -> bool:
 if not valid(data): return false
 items = data.items.duplicate(true); worn = data.worn.duplicate()
 dust = int(data.dust); next_id = int(data.next_id)
 return true

func value_text(key: String, value: float) -> String:
 return ("+%.1f%%" if key in ["power","crit","haste"] else "+%.1f") % value
