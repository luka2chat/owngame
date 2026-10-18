"""Create a small distributable OFL UI font from the full font stored on NAS.

Requires fontTools. Re-run after adding story text so all new glyphs are included.
Usage: python subset-story-font.py /absolute/path/to/NotoSansSC[wght].ttf
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
destination = root/'unity/LittleOrbit/Assets/Resources/Fonts'
destination.mkdir(parents=True, exist_ok=True)
sources=list((root/'unity/LittleOrbit/Assets/Scripts/Story').glob('*.cs'))
# Scene builders also serialize Chinese labels into interaction components.
sources+=list((root/'unity/LittleOrbit/Assets/Editor').glob('*.cs'))
text = ''.join(p.read_text() for p in sources)
chars = set(range(32,127)) | {ord(c) for c in text if not c.isspace()}
font = TTFont(source)
missing = chars - set(font.getBestCmap())
if missing:
    raise SystemExit(f'Missing source glyphs: {sorted(missing)}')
options = subset.Options()
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=chars)
subsetter.subset(font)
font = instantiateVariableFont(font, {'wght':400}, inplace=True)
for record in font['name'].names:
    replacements = {1:'Star Letters UI', 2:'Regular', 3:'StarLettersUI-Regular-v1',
                    4:'Star Letters UI Regular', 6:'StarLettersUI-Regular', 16:'Star Letters UI',17:'Regular'}
    if record.nameID in replacements:
        record.string = replacements[record.nameID].encode(record.getEncoding())
output = destination/'StarLettersUI.ttf'
font.save(output)
shutil.copyfile(source.with_name('OFL.txt'), destination/'OFL.txt')
report = {
    'sourceURL':'https://github.com/google/fonts/tree/main/ofl/notosanssc',
    'sourceSHA256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'outputSHA256': hashlib.sha256(output.read_bytes()).hexdigest(),
    'fontVersion': font['name'].getDebugName(5),
    'characters':len(chars), 'bytes':output.stat().st_size,
    'license':'SIL Open Font License 1.1; see OFL.txt',
    'note':'Subset and renamed for this game. Full input remains on NAS; re-run when story text changes.'
}
(destination/'font-source.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
