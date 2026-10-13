# build the audio plan for the reel: python3 reelplan.py out.json 01,08,10
import re, json, sys
sys.path.insert(0, '.')
ids = sys.argv[2].split(',')
DIRS = {m.group(1): m.group(2) for m in re.finditer(r"id: '(\d+)', dir: '([\w-]+)'", open('comp/meta.js').read())}
def cues(path):
    import os
    cj = os.path.join(os.path.dirname(path), 'cues.json')
    if os.path.exists(cj):
        return [{k: v for k, v in c.items() if k in ('t', 'sfx', 'gain', 'pan')} for c in json.load(open(cj))]
    s = open(path).read()
    m = re.search(r'cues:\s*\[(.*?)\]', s, re.S)
    out = []
    if m:
        for t, x, g in re.findall(r"t:\s*([\d.]+),\s*sfx:\s*'(\w+)'(?:,\s*gain:\s*([\d.]+))?", m.group(1)):
            c = {'t': float(t), 'sfx': x}
            if g: c['gain'] = float(g)
            out.append(c)
    return out
INTRO, BLOCK, OUTRO = 4.0, 10.0, 6.0
plan = {'sections': [{'kind': 'intro', 'start': 0, 'dur': INTRO, 'cues': [{'t': 0.05, 'sfx': 'riser_short'}, {'t': 0.3, 'sfx': 'ticks'}, {'t': 1.75, 'sfx': 'impact'}, {'t': 3.0, 'sfx': 'whoosh'}, {'t': 3.35, 'sfx': 'pop'}, {'t': 3.62, 'sfx': 'sparkle', 'gain': 0.5}]}], 'global_cues': []}
for k, i in enumerate(ids):
    st = INTRO + k * BLOCK
    plan['sections'].append({'kind': i, 'start': st, 'dur': BLOCK, 'cues': cues(f'styles/{DIRS[i]}/index.html')})
end = INTRO + len(ids) * BLOCK
plan['sections'].append({'kind': 'outro', 'start': end, 'dur': OUTRO, 'cues': [{'t': 0.12, 'sfx': 'sparkle'}, {'t': 0.2, 'sfx': 'ticks'}, {'t': 0.35, 'sfx': 'impact_soft'}, {'t': 4.6, 'sfx': 'tail'}]})
# ball transitions: landing at every boundary from 4.0 on
for k in range(len(ids) + 1):
    B = INTRO + k * BLOCK
    g = plan['global_cues']
    g += [{'t': B, 'sfx': 'land', 'gain': 0.9}, {'t': B + 0.02, 'sfx': 'expand', 'gain': 0.7}]
    if k > 0:
        g += [{'t': B - 1.28, 'sfx': 'suck', 'gain': 0.8}, {'t': B - 0.73, 'sfx': 'boing', 'gain': 0.8}, {'t': B - 0.48, 'sfx': 'boing2', 'gain': 0.8}, {'t': B - 0.48, 'sfx': 'sparkle', 'gain': 0.35}]
json.dump(plan, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
print('sections', len(plan['sections']), 'dur', end + OUTRO)
