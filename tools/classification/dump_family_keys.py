"""Write the Python family key for every exported error variant.

    python tools/classification/dump_family_keys.py <daten.json> <out.json>

The output is the oracle for packages/shared's TypeScript familyKey() port
(test/family.equivalence.test.ts). It contains customer names: keep it out of git.
"""
import json, sys
from family import family_key

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
rows = []
for e in d['errors']:
    kind = 'biz' if e['source'].startswith('Business') else 'job' if e['source'].startswith('Job') else 'app'
    rows.append({'kind': kind, 'message': e['message'], 'key': family_key(e['message'], e['source'])})
json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(f'{len(rows)} variants written to {out}')
