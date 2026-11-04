#!/usr/bin/env python3
"""Explicit-device USB delivery and touch checks. Does not clear app data."""
import argparse,json,pathlib,subprocess,time
p=argparse.ArgumentParser();p.add_argument('--device',required=True);p.add_argument('--build',required=True);p.add_argument('--evidence',required=True);p.add_argument('--cold-start',action='store_true');p.add_argument('--game');args=p.parse_args()
base=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(args.evidence);out.mkdir(parents=True,exist_ok=True)
# This check is for the verified 1080x2400 Moto viewport (360x720, 120px top letterbox).
def adb(*words):return subprocess.check_output(['adb','-s',args.device,*map(str,words)])
size=adb('shell','wm','size').decode();assert '1080x2400' in size,size
if args.cold_start:adb('shell','am','force-stop','dev.owngame.app')
def tap(x,y):adb('shell','input','tap',round(x*3),round(y*3+120))
def swipe(x1,y1,x2,y2,ms):adb('shell','input','swipe',round(x1*3),round(y1*3+120),round(x2*3),round(y2*3+120),ms)
def wait_log(marker,timeout=25):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  raw=subprocess.check_output(["owngame","device","logs","--platform","android","--device",args.device],text=True)
  if marker in raw:return
  time.sleep(0.6)
 raise RuntimeError("Game did not report "+marker)
def shot(name): (out/name).write_bytes(adb('exec-out','screencap','-p'))
records=[]
for row in json.loads((base/'batch.json').read_text()):
 if args.game and args.game!=row['id']:continue
 run=subprocess.run(['owngame','device','sync',str(pathlib.Path(args.build)/row['id']),'--platform','android','--device',args.device,'--id','remake-'+row['id'],'--title',row['title']+' · Godot','--timeout','75'],capture_output=True,text=True,timeout=120)
 (out/(row['id']+'-sync.log')).write_text(run.stdout+run.stderr)
 if run.returncode:raise RuntimeError(run.stdout+run.stderr)
 receipt=json.loads(run.stdout.strip().splitlines()[-1]);assert receipt['status']=='running'
 wait_log("MOBILE_READY "+row["id"])
 time.sleep(0.4)
 tap(180,469);wait_log("MOBILE_STATE "+row["id"]+" play")
 mode=row['mode']
 if mode=='tower':
  tap(80,187);tap(94,638);tap(170,187);tap(265,638);tap(94,549)
 elif mode=='cards':
  tap(88,400);tap(94,638);tap(94,638);time.sleep(0.9)
 elif mode=='pinball':
  swipe(60,350,60,350,500);swipe(290,350,290,350,500)
 elif mode in ('shooter','climb'):
  swipe(100,400,190,410,450);tap(94,638)
 elif mode in ('side','platform'):
  swipe(110,642,110,642,450);tap(209,638)
 elif mode=='hunt':
  swipe(70,642,88,605,650);swipe(209,638,209,638,1200);tap(305,638)
 else:
  swipe(70,642,70,605,700);tap(305,638)
 time.sleep(0.5);shot(row['id']+'-phone-play.png')
 tap(315,59);wait_log("MOBILE_STATE "+row["id"]+" pause");time.sleep(0.3);shot(row['id']+'-phone-pause.png')
 logs=subprocess.check_output(['owngame','device','logs','--platform','android','--device',args.device],text=True)
 (out/(row['id']+'-logs.json')).write_text(logs)
 parsed=json.loads(logs)
 errors=[x for x in parsed.get('logs',[]) if x.get('level','').upper() in ['ERROR','FATAL'] or 'SCRIPT ERROR' in x.get('message','')]
 inputs=[]
 for line in parsed.get('logs',[]):
  message=line.get('message','')
  prefix='MOBILE_INPUT '+row['id']+' '
  if prefix in message:
   tail=message.split(prefix,1)[1]
   label,data=tail.split(' ',1)
   inputs.append({'action':label,'state':json.JSONDecoder().raw_decode(data)[0]})
 assert inputs, 'No input evidence for '+row['id']
 if mode=='cards':
  assert any(i['action']=='card:0' and i['state']['mana']==3 and i['state']['allies']==0 for i in inputs),inputs
  assert any(i['action']=='primary' and i['state']['mana']==2 and i['state']['allies']==1 for i in inputs),inputs
  assert any(i['state']['resolving'] for i in inputs),inputs
 elif mode=='tower':
  assert any(i['state']['build_cell']==0 and i['state']['towers']==0 for i in inputs),inputs
  assert any(i['state']['wave']==1 and i['state']['towers']==2 for i in inputs),inputs
 elif mode in ('shooter','climb'):
  assert any(i['action']=='field_release' and i['state']['x']>210 for i in inputs),inputs
 elif mode=='pinball':assert any(i['state']['launched'] for i in inputs),inputs
 elif mode in ('side','platform'):assert any(i['action']=='primary' and i['state']['vy']<0 and i['state']['x']>90 for i in inputs),inputs
 elif mode=='cores':assert any(i['state']['dash']>0 and i['state']['y']<0 for i in inputs),inputs
 elif mode=='hunt':assert any(i['state']['wood']>0 or i['state']['ore']>0 for i in inputs),inputs
 records.append({'input_states':inputs,'id':row['id'],'version':receipt['version'],'requestId':receipt['requestId'],'runtime_errors':errors,'actions':'Godot-ready signal; touch start confirmed by phase log; mode-specific touch; touch pause confirmed by phase log; screenshots saved; visual review required'})
 print(row['id'],'RUNNING','errors',len(errors),flush=True)
 (out/'device-results.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
 if errors:raise RuntimeError(errors)
 # Close this test game through the container capsule, releasing its WebGL context.
 adb("shell","input","tap",978,176);time.sleep(0.4)
