#!/usr/bin/env python3
import os, argparse

GALLERY_FILES=[
 "components/gallery-page.tsx",
 "components/gallery/bulk-action-bar.tsx",
 "components/gallery/settings-panel.tsx",
 "components/gallery/ui-components.tsx",
 "components/gallery/viewer-components.tsx",
]
DIRS=("hooks","types","lib")
EXTS={".tsx",".ts",".js",".jsx",".mjs"}

def collect(root):
    files=[]
    for f in GALLERY_FILES:
        p=os.path.join(root,f)
        files.append(p) if os.path.isfile(p) else None
    for d in DIRS:
        for dp,_,fns in os.walk(os.path.join(root,d)):
            for fn in fns:
                if os.path.splitext(fn)[1] in EXTS:
                    files.append(os.path.join(dp,fn))
    return sorted(set(files))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("root",nargs="?",default=".")
    p.add_argument("-o","--output",default="code_backup.txt")
    a=p.parse_args()
    files=collect(a.root)
    with open(a.output,"w",encoding="utf-8") as o:
        for f in files:
            o.write(f"=== {os.path.abspath(f)} ===\n\n")
            o.write(open(f,encoding="utf-8").read())
            o.write("\n\n")
    print(f"Backed up {len(files)} files → {a.output}")

if __name__=="__main__":
    main()
