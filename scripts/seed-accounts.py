#!/usr/bin/env python3
"""Set the two initial login passwords without writing plaintext passwords to disk.
Only used to initialize a NEW server database. Existing accounts retain changes.
"""
import base64,getpass,hashlib,json,secrets
from pathlib import Path
def b64(v): return base64.urlsafe_b64encode(v).decode().rstrip('=')
accounts=[]
for role,username,name in [('hyu','hyusukk','Hyu Suk'),('jasmin','JAZZY','Jazzy')]:
    password=getpass.getpass('Initial password for '+username+': ')
    if not 6<=len(password)<=128: raise SystemExit('Use 6–128 characters for an initial password.')
    salt=secrets.token_bytes(32)
    hashed=hashlib.scrypt(password.encode(),salt=salt,n=16384,r=8,p=1,dklen=64,maxmem=64*1024*1024)
    accounts.append(dict(role=role,username=username,name=name,salt=b64(salt),hash=b64(hashed)))
    password=None
path=Path(__file__).resolve().parents[1]/'server'/'accounts.seed.json'
path.write_text(json.dumps(accounts,indent=2)+'\n')
print('Saved salted password hashes for the two accounts. No plaintext passwords saved.')
