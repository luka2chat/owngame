#!/usr/bin/env python3
import os, pathlib, subprocess, json, sys
base=pathlib.Path(__file__).resolve().parents[1]
godot=os.environ.get('GODOT_BIN','godot')
failed=[]
for row in json.loads((base/'batch.json').read_text()):
 p=base/row['id']
 for command in [['--headless','--path',str(p),'--import'],['--headless','--path',str(p),'--script','res://shared/tests/smoke.gd','--quit-after','180'],['--headless','--path',str(p),'--script','res://shared/tests/interactions.gd','--quit-after','180'],['--headless','--path',str(p),'--script','res://shared/tests/playthrough.gd','--quit-after','180']]:
  run=subprocess.run([godot,*command],capture_output=True,text=True,timeout=90)
  output=run.stdout+run.stderr
  if run.returncode or 'SCRIPT ERROR' in output or ('--script' in command and ('phase=clear' if 'res://shared/tests/playthrough.gd' in command else 'INTERACTION PASS' if 'res://shared/tests/interactions.gd' in command else 'SMOKE PASS') not in output):
   print(row['id'],output[-10000:]);failed.append(row['id']);break
 else:print(row['id'],'PASS',flush=True)
sys.exit(bool(failed))
