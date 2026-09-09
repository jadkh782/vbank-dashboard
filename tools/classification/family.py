import re
def family_key(msg, source):
    m = msg
    # job faults: keep only the leading message, drop ".NET type + stack trace"
    if source.startswith('Job fault'):
        m = re.split(r'\s(?:System|UiPath|Microsoft|Newtonsoft)\.[A-Za-z0-9_.]+(?:Exception|Error)\b', m)[0]
        m = re.split(r'\s(?:at|bei)\s+[A-Za-z_]+\.', m)[0]
    m = re.sub(r'<[a-z]+ [^>]*>', '<selector>', m)          # UI selectors
    m = re.sub(r'"[^"]*"', '"…"', m)                        # quoted values
    m = re.sub(r"'[^']*'", "'…'", m)
    m = re.sub(r'\([^()]*\)', '(…)', m)                     # parenthesised values
    m = re.sub(r'\S+\.(?:csv|xlsx?|xlsm|pdf|txt|xml|json|docx?|msg|zip)\b', '<file>', m, flags=re.I)
    m = re.sub(r'\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b', '<iban>', m)
    m = re.sub(r'\d+[.,]\d+', '<n>', m)
    m = re.sub(r'\d+', '<n>', m)
    m = re.sub(r'<n>(?:[.,]<n>)+', '<n>', m)
    m = re.sub(r'(?:<n>[-/ ]?){2,}', '<n>', m)
    m = re.sub(r'(?<=[:=]) ?\S{16,}', ' <wert>', m)          # long tokens after a colon (ids, hashes)
    m = re.sub(r'\s+', ' ', m).strip(' .:;,-–')
    m = m.lower()
    if len(m) > 140: m = m[:140]
    return m
