const M = '/Users/jon/Dev/retrogames-forge-comet-drift-hd-542/src/games/CometDrift/track.js'
const Tmod = await import(M)
const catmull = (p0,p1,p2,p3,t) => {
  const t2=t*t,t3=t2*t
  return 0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3)
}
const SEG=26
function poly(control){
  const pts=[];const n=control.length
  for(let i=0;i<n;i++){const p0=control[(i-1+n)%n],p1=control[i],p2=control[(i+1)%n],p3=control[(i+2)%n]
    for(let j=0;j<SEG;j++){const t=j/SEG;pts.push({x:catmull(p0[0],p1[0],p2[0],p3[0],t),y:catmull(p0[1],p1[1],p2[1],p3[1],t)})}}
  const N=pts.length
  for(let i=0;i<N;i++){const p=pts[i],q=pts[(i+1)%N],o=pts[(i-1+N)%N];p.a=Math.atan2(q.y-o.y,q.x-o.x);p.d=Math.hypot(q.x-p.x,q.y-p.y)}
  for(let i=0;i<N;i++){let da=pts[(i+1)%N].a-pts[i].a;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;pts[i].k=da/Math.max(1,pts[i].d)}
  return pts
}
const rOf=(p)=>{const k=Math.abs(p.k);return k>1e-9?1/k:Infinity}
const wrap=(i,n)=>((i%n)+n)%n
const winMin=(pts,i,half)=>{let m=Infinity;for(let w=-half;w<=half;w++){m=Math.min(m,rOf(pts[wrap(i+w,pts.length)]))}return m}
for (const id of ['sandbank','corkscomb']) {
  const course = Tmod.COURSES.find(c=>c.id===id)
  const grown = course.control.map(p=>[...p])
  const n0 = grown.length
  const base = poly(grown)
  const targets = []
  for (let c=0;c<n0;c++) {
    const r0 = winMin(base, c*SEG, SEG)
    targets.push(r0 < 280 ? Math.max(105, Math.min(150, r0*0.5)) : Infinity)
  }
  const control = grown.map(p=>[...p])
  const STEP = 6
  const moveDir = (pts, c, wantReduce) => {
    const p = pts[c*SEG]
    const nx = -Math.sin(p.a), ny = Math.cos(p.a)
    const test = (s) => {
      const ctrl = control.map((q,ci)=> ci===c ? [q[0]+nx*s*STEP, q[1]+ny*s*STEP] : q)
      const pp = poly(ctrl)
      return wantReduce ? winMin(pp, c*SEG, SEG) : -winMin(pp, c*SEG, SEG)
    }
    const d1 = test(1), d2 = test(-1)
    return d1 < d2 ? [nx, ny] : [-nx, -ny]
  }
  // tighten loop
  for (let pass=0; pass<140; pass++) {
    const pts = poly(control)
    let viol = false
    for (let c=0;c<n0;c++) {
      if (!isFinite(targets[c])) continue
      const rNow = winMin(pts, c*SEG, SEG)
      if (rNow <= targets[c]+4) continue
      viol = true
      const [dx,dy] = moveDir(pts, c, true)
      control[c] = [control[c][0]+dx*STEP, control[c][1]+dy*STEP]
    }
    if (!viol) break
  }
  // floor repair: nothing under 97
  for (let pass=0; pass<120; pass++) {
    const pts = poly(control)
    let bi=-1, br=Infinity
    for (let i=0;i<pts.length;i++){const r=rOf(pts[i]);if(r<br){br=r;bi=i}}
    if (br >= 97) break
    const c = Math.round(bi/SEG)%n0
    const [dx,dy] = moveDir(pts, c, false)
    control[c] = [control[c][0]+dx*STEP, control[c][1]+dy*STEP]
  }
  const fin = poly(control)
  const res=[]
  for(let c=0;c<n0;c++){const dx=Math.round(control[c][0]-grown[c][0]),dy=Math.round(control[c][1]-grown[c][1]);if(dx||dy)res.push(`[${c},${dx},${dy}]`)}
  console.log(id, 'minR', Math.min(...fin.map(rOf)).toFixed(0),
    'targets hit:', targets.map((t,c)=>isFinite(t)?`${c}:${winMin(fin,c*SEG,SEG).toFixed(0)}<=${t.toFixed(0)}${winMin(fin,c*SEG,SEG)<=t+4?'✓':'✗'}`:null).filter(Boolean).join(' '))
  console.log('  ['+res.join(',')+']')
}
