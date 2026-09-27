#!/usr/bin/env python3
"""
A13 Album Desktop Light — Master measurement (pilot V1), reproducible.

Usage: python3 scripts/pilot/album-a13-measure-master.py <master image> [out.json]
Requires: pillow, numpy, opencv-python-headless.

Transcribed result: config/album-a13-master-measurements.ts (source px, 1536 frame).
1. rough photo boxes (colour distance to the table cream, per print, reading order);
2. per-side sub-pixel photo/paper edge maxima, robust rotated-rectangle fit
   (outliers rejected, opposite sides parallel); P10 (pale sky) is seeded
   from a manual quad, then fitted the same way;
3. outer paper = window + 13 px (sides, top) + bottom band (measured where
   unobstructed: P4 39, P5 33, P6 32.5, P9 34, P10 41.5, P11 37.5; else median);
4. top ornament ink box (P1 excluded) and body colour samples.
The Master itself is not committed.
"""
import json, sys
import numpy as np, cv2
from PIL import Image

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else None
im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
cream = np.array([246, 229, 209], np.float32)
D = cv2.GaussianBlur(np.sqrt(((im - cream) ** 2).sum(2)), (3, 3), 0)

ROUGH = {  # rough photo boxes x, y, w, h (colour-distance components), reading order
    'P1': [254, 65, 447, 270], 'P2': [1036, 91, 345, 216], 'P3': [87, 338, 323, 188], 'P4': [478, 335, 561, 245],
    'P5': [1100, 337, 371, 211], 'P6': [64, 558, 410, 215], 'P7': [800, 606, 285, 143], 'P8': [1173, 589, 321, 166],
    'P9': [202, 788, 329, 180], 'P10': None, 'P11': [1118, 793, 342, 209]}
P10_SEED = [[634, 779], [1021, 811], [1005, 997], [613, 957]]

def params(C):
    C=np.array(C); c=C.mean(0)
    th=np.arctan2(C[1][1]-C[0][1],C[1][0]-C[0][0])
    if abs(np.degrees(th))>8: th=np.arctan2(C[2][1]-C[3][1],C[2][0]-C[3][0])
    w=np.hypot(*(C[2]-C[3])); h=np.hypot(*(C[2]-C[1]))
    return c,th,w,h
def corners(c,th,w,h):
    u=np.array([np.cos(th),np.sin(th)]); v=np.array([-np.sin(th),np.cos(th)])
    return np.array([c-u*w/2-v*h/2,c+u*w/2-v*h/2,c+u*w/2+v*h/2,c-u*w/2+v*h/2])
def edge_samples(c,th,w,h,band=18):
    # sample along each side, search perpendicular for max gradient of D (outside->inside increase)
    u=np.array([np.cos(th),np.sin(th)]); v=np.array([-np.sin(th),np.cos(th)])
    pts=[]
    for side,(n,t,half_t,off) in dict(top=(-v,u,w/2,h/2),bot=(v,u,w/2,h/2),lef=(-u,v,h/2,w/2),rig=(u,v,h/2,w/2)).items():
        for s in np.linspace(-0.85*half_t,0.85*half_t,60):
            base=c+t*s+n*off
            offs=np.arange(-band,band+1,0.5)
            P=base[None,:]+offs[:,None]*n[None,:]
            vals=cv2.remap(D,P[:,0:1].astype(np.float32),P[:,1:2].astype(np.float32),cv2.INTER_LINEAR).flatten()
            g=vals[:-2]-vals[2:]   # inside (negative offs) minus outside
            i=np.argmax(g)
            if g[i]<6: continue
            pts.append((side,base+offs[i+1]*n,g[i]))
    return pts
def fitrect(c,th,w,h):
    for it in range(6):
        S=edge_samples(c,th,w,h,band=18 if it<2 else 8)
        # least squares: each side point lies on its line
        u=np.array([np.cos(th),np.sin(th)]); v=np.array([-np.sin(th),np.cos(th)])
        # project points into rect frame, estimate side offsets robustly, then angle from top/bot and lef/rig slopes
        loc={k:[] for k in ('top','bot','lef','rig')}
        for side,p,g in S:
            d=p-c; loc[side].append((d@u,d@v))
        def robust_line(arr,axis):
            a=np.array(arr)
            if len(a)<8: return None
            x=a[:,axis]; y=a[:,1-axis]
            keep=np.ones(len(a),bool)
            for _ in range(5):
                A=np.vstack([x[keep],np.ones(keep.sum())]).T
                m,b=np.linalg.lstsq(A,y[keep],rcond=None)[0]
                r=np.abs(y-(m*x+b)); keep=r<max(1.5,np.median(r[keep])*2.5)
            return m,b,keep.sum()
        T=robust_line(loc['top'],0);B=robust_line(loc['bot'],0);L=robust_line(loc['lef'],1);R=robust_line(loc['rig'],1)
        slopes=[];wts=[]
        for q in (T,B):
            if q: slopes.append(np.arctan(q[0]));wts.append(q[2])
        for q in (L,R):
            if q: slopes.append(-np.arctan(q[0]));wts.append(q[2])
        dth=np.average(slopes,weights=wts)
        top=T[1] if T else -h/2; bot=B[1] if B else h/2; lef=L[1] if L else -w/2; rig=R[1] if R else w/2
        c=c+u*(lef+rig)/2+v*(top+bot)/2; w=rig-lef; h=bot-top; th=th+dth
    return c,th,w,h,{k:(None if q is None else int(q[2])) for k,q in dict(T=T,B=B,L=L,R=R).items()}

def fit(pts):
    pts=np.array(pts,np.float32)
    for _ in range(4):
        vx,vy,x0,y0=cv2.fitLine(pts,cv2.DIST_HUBER,0,0.01,0.01).flatten()
        n=np.array([-vy,vx]); r=np.abs((pts-[x0,y0])@n)
        keep=r<max(2.0,np.percentile(r,80))
        pts=pts[keep]
    return (float(vx),float(vy),float(x0),float(y0)),len(pts)
def inter(l1,l2):
    (a,b,x1,y1),(c,d,x2,y2)=l1,l2
    A=np.array([[a,-c],[b,-d]]);t=np.linalg.solve(A,[x2-x1,y2-y1])
    return [x1+a*t[0],y1+b*t[0]]

def first_pass(x, y, w, h):
    """Per-side line fit on the rough box (seed of the rectangle fit)."""
    top = []; bot = []; lef = []; rig = []
    for cx in range(int(x + 0.12 * w), int(x + 0.88 * w), 3):
        col = D[:, cx]
        ys = np.arange(max(0, y - 40), y + 45); g = col[ys + 1] - col[ys - 1]; top.append((cx, ys[np.argmax(g)] + 0.0))
        ys = np.arange(y + h - 45, min(1022, y + h + 40)); g = col[ys - 1] - col[ys + 1]; bot.append((cx, ys[np.argmax(g)] + 0.0))
    for cy in range(int(y + 0.12 * h), int(y + 0.88 * h), 3):
        row = D[cy, :]
        xs = np.arange(max(1, x - 40), x + 45); g = row[xs + 1] - row[xs - 1]; lef.append((xs[np.argmax(g)] + 0.0, cy))
        xs = np.arange(x + w - 45, min(1534, x + w + 40)); g = row[xs - 1] - row[xs + 1]; rig.append((xs[np.argmax(g)] + 0.0, cy))
    L = {k: fit(v)[0] for k, v in dict(top=top, bot=bot, lef=lef, rig=rig).items()}
    return [inter(L['top'], L['lef']), inter(L['top'], L['rig']), inter(L['bot'], L['rig']), inter(L['bot'], L['lef'])]


BAND = {'P4': 39, 'P5': 33, 'P6': 32.5, 'P9': 34, 'P10': 41.5, 'P11': 37.5}
MB = float(np.median(list(BAND.values())))
res = {}
for k, box in ROUGH.items():
    c, th, w, h = params(P10_SEED if box is None else first_pass(*box))
    c, th, w, h, sup = fitrect(c, th, w, h)
    u = np.array([np.cos(th), np.sin(th)]); v = np.array([-np.sin(th), np.cos(th)])
    b = BAND.get(k, MB); m = 13.0
    oc = c + v * (b - m) / 2
    res[k] = dict(windowCenter=c.round(1).tolist(), windowSize=[round(float(w), 1), round(float(h), 1)], rotationDeg=round(float(np.degrees(th)), 2),
                  outerCenter=oc.round(1).tolist(), outerSize=[round(float(w + 2 * m), 1), round(float(h + m + b), 1)], bottomBand=b, bottomBandMeasured=k in BAND, support=sup)
    print(k, res[k])
if OUT:
    json.dump(res, open(OUT, 'w'), indent=1)
