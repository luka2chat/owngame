#!/usr/bin/env python3
"""Export each independent portrait Godot project. No reference archive is executed."""
import argparse, json, os, pathlib, subprocess, hashlib, html, shutil
parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--game');args=parser.parse_args()
base=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
godot=os.environ.get('GODOT_BIN','godot');results=[]
for row in json.loads((base/'batch.json').read_text()):
 if args.game and args.game!=row['id']:continue
 project=base/row['id'];destination=out/row['id'];destination.mkdir(parents=True,exist_ok=True)
 for cmd in [['--headless','--path',str(project),'--import'],['--headless','--path',str(project),'--export-release','Mobile Web',str(destination/'index.html')]]:
  run=subprocess.run([godot,*cmd],capture_output=True,text=True,timeout=180)
  if run.returncode or 'SCRIPT ERROR' in run.stdout+run.stderr:raise RuntimeError(run.stdout+run.stderr)
 files=[]
 for name in ['index.html','index.js','index.pck','index.wasm']:
  f=destination/name
  if not f.is_file() or f.stat().st_size==0:raise RuntimeError('Missing '+str(f))
  files.append(dict(path=name,bytes=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest()))
 results.append(dict(id=row['id'],title=row['title'],files=files))
 print(row['id'],'EXPORTED',sum(f['bytes'] for f in files),flush=True)
(out/'build-receipt.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
if not args.game:
 shutil.copy2(base/'shared/assets/backdrops.png',out/'cover-atlas.png')
 cards=[]
 for index,row in enumerate(json.loads((base/'batch.json').read_text())):
  cards.append('<a class="card" href="./'+row['id']+'/index.html"><div class="cover" style="background-position:'+str(index%3*50)+'% '+str(index//3*50)+'%"></div><div class="copy"><small>GODOT · 竖屏触控</small><h2>'+html.escape(row['title'])+'</h2><p>'+html.escape(row['mechanics'])+'</p><span>开始试玩 →</span></div></a>')
 page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>九种冒险 · Godot 手机版</title><style>*{box-sizing:border-box}body{margin:0;background:#0b1420;color:#eaf3f4;font-family:system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:40px 22px}small{color:#9ccecb;letter-spacing:2px;font-size:11px}h1{font-size:clamp(32px,6vw,60px);margin:15px 0}header p{color:#adc0cf;max-width:680px;line-height:1.8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;margin-top:36px}.card{color:inherit;text-decoration:none;background:#152537;border:1px solid #2c4154;border-radius:18px;overflow:hidden;transition:transform .2s}.card:hover{transform:translateY(-4px);border-color:#98dacb}.cover{height:190px;background-image:url(cover-atlas.png);background-size:300% 300%;image-rendering:pixelated}.copy{padding:22px}.copy h2{font-size:23px;margin:12px 0}.copy p{color:#b0c4cf;font-size:14px;line-height:1.8;min-height:76px}.copy span{color:#9ce8d2;font-weight:bold}footer{margin-top:32px;color:#8eacba;font-size:13px;line-height:1.8}</style><main><header><small>OWNGAME LAB / MOBILE ARCADE</small><h1>九种冒险，随手开局。</h1><p>从 17 个参考包中合并出 9 种玩法，用 Godot 重新制作。全新生成的像素美术与合成音效，手机竖屏操作，每次通关都能继续挑战下一关。</p></header><section class="grid">'''+''.join(cards)+'''</section><footer>本地试玩版 · 每款首次加载约 50 MB，请等待引擎启动。按游戏提示使用拖动、方向键、摇杆或点击；电脑预览可用 WASD 移动、空格主动作、E 副动作。游戏内界面目前为英文。试玩反馈与 iOS 真机验证尚未完成。</footer></main></html>'''
 (out/'index.html').write_text(page)
