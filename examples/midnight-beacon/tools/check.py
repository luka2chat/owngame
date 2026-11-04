"""Godot source and focused gameplay checks; outputs stay outside the source tree."""
import pathlib,os,subprocess
project=pathlib.Path(__file__).resolve().parents[1]
engine=os.environ.get('GODOT_BIN','godot')
commands=[(['--import'],None)]
for name,marker in [('smoke','SMOKE PASS'),('equipment_test','EQUIPMENT PASS'),('feel_pickup','FEEL PICKUP PASS')]:
 commands.append((['--script','res://tests/'+name+'.gd','--quit-after','180'],marker))
for args,marker in commands:
 run=subprocess.run([engine,'--headless','--path',str(project),*args],capture_output=True,text=True,timeout=90)
 text=run.stdout+run.stderr
 if run.returncode or 'SCRIPT ERROR' in text or (marker and marker not in text):raise RuntimeError(text)
 print(marker or 'IMPORT PASS',flush=True)
