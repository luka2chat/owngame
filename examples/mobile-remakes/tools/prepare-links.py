#!/usr/bin/env python3
"""Materialize only Git symlink placeholders on systems without symlink support."""
import json,pathlib,shutil
base=pathlib.Path(__file__).resolve().parents[1]
for row in json.loads((base/'batch.json').read_text()):
 link=base/row['id']/'shared'
 if link.is_symlink() or link.is_dir():continue
 if link.exists():
  if not link.is_file() or link.read_text().strip()!='../shared':raise RuntimeError('Unexpected shared path: '+str(link))
  link.unlink()
 shutil.copytree(base/'shared',link)
 print('Prepared shared resources for',row['id'])
