(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))a(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const s of r.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&a(s)}).observe(document,{childList:!0,subtree:!0});function t(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function a(i){if(i.ep)return;i.ep=!0;const r=t(i);fetch(i.href,r)}})();function p(e,n){e.innerHTML=`
    <div style="display:flex;justify-content:center;align-items:center;min-height:100vh;">
      <div style="background:#1e1e2e;padding:40px;border-radius:12px;width:360px;">
        <h1 style="margin:0 0 24px 0;text-align:center;">career-ops</h1>
        <form id="login-form">
          <label for="username">Username</label><br>
          <input type="text" id="username" name="username" value="kurniawan" style="width:100%;margin-bottom:16px;padding:8px;" />
          <label for="password">Password</label><br>
          <input type="password" id="password" name="password" style="width:100%;margin-bottom:24px;padding:8px;" />
          <button type="submit" style="width:100%;padding:10px;background:#89b4fa;border:none;font-weight:600;cursor:pointer;">Login</button>
        </form>
        <div id="login-error" style="color:#f38ba8;margin-top:12px;text-align:center;"></div>
      </div>
    </div>
  `,e.querySelector("#login-form").onsubmit=async t=>{t.preventDefault();const a=e.querySelector("#username").value,i=e.querySelector("#password").value,r=e.querySelector("#login-error");r.textContent="";const o=await(await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:a,password:i})})).json();o.token?(localStorage.setItem("token",o.token),localStorage.setItem("username",o.username),n(o.token)):r.textContent=o.error||"Login failed"}}const m=[{id:"dashboard",label:"Dashboard"},{id:"scan",label:"Scan"},{id:"search",label:"Search Jobs"},{id:"listings",label:"My Listings"},{id:"cv",label:"CV & Profile"},{id:"pipeline",label:"Pipeline"}];function h(e,n){e.innerHTML=`
    <nav>
      <ul>
        ${m.map(t=>`<li><a href="#" data-id="${t.id}">${t.label}</a></li>`).join("")}
      </ul>
    </nav>
  `,e.querySelectorAll("a").forEach(t=>{t.onclick=a=>{a.preventDefault(),n(t.dataset.id)}})}const y="";async function l(e,n,t){const a=localStorage.getItem("token"),i={"Content-Type":"application/json"};a&&(i.Authorization=`Bearer ${a}`);const r=await fetch(`${y}${n}`,{method:e,headers:i,body:t?JSON.stringify(t):void 0});if(r.status===401)throw localStorage.removeItem("token"),localStorage.removeItem("username"),window.location.reload(),new Error("unauthorized");return r.json()}function d(e){e.innerHTML='<h1>Dashboard</h1><div id="dashboard-metrics">Loading...</div>',l("GET","/api/listings").then(n=>{const t=n.length,a={};n.forEach(i=>{a[i.status]=(a[i.status]||0)+1}),e.querySelector("#dashboard-metrics").innerHTML=`
      <div>Total Applications: <b>${t}</b></div>
      <div>By Status: ${Object.entries(a).map(([i,r])=>`${i}: ${r}`).join(", ")}</div>
    `}).catch(n=>{e.querySelector("#dashboard-metrics").textContent="Failed to load: "+n.message})}function f(e){e.innerHTML=`<h1>Scan</h1>
    <div style="margin-bottom:24px;">
      <button id="linkedin-login">Start LinkedIn Login</button>
      <button id="linkedin-save">Save LinkedIn Session</button>
    </div>
    <form id="scan-form">
      <label><input type="checkbox" name="portal" value="greenhouse" checked> Greenhouse</label>
      <label><input type="checkbox" name="portal" value="ashby" checked> Ashby</label>
      <label><input type="checkbox" name="portal" value="lever" checked> Lever</label>
      <label><input type="checkbox" name="portal" value="linkedin"> LinkedIn</label>
      <button type="submit">Start Scan</button>
    </form>
    <pre id="scan-progress"></pre>`;const n=e.querySelector("#scan-progress"),t=e.querySelector("#scan-form"),a=e.querySelector("#linkedin-login"),i=e.querySelector("#linkedin-save");a.onclick=async()=>{n.textContent=`Opening LinkedIn login session...
`;try{const r=await l("POST","/api/playwright/start",{portal:"linkedin"});n.textContent+=JSON.stringify(r,null,2)+`
`}catch(r){n.textContent+="Error: "+r.message+`
`}},i.onclick=async()=>{n.textContent=`Saving LinkedIn session...
`;try{const r=await l("POST","/api/playwright/save",{portal:"linkedin"});n.textContent+=JSON.stringify(r,null,2)+`
`}catch(r){n.textContent+="Error: "+r.message+`
`}},t.onsubmit=r=>{r.preventDefault(),n.textContent=`Starting scan...
`;const s=new EventSource("/api/scan");s.onmessage=o=>n.textContent+=o.data+`
`,s.addEventListener("end",o=>{n.textContent+=`
`+o.data+`
`,s.close()})}}function b(e){e.innerHTML=`
    <h1>Search Jobs</h1>
    <form id="search-form">
      <label for="description">Describe the job you want:</label><br>
      <textarea id="description" name="description" rows="6" style="width:100%;"></textarea><br>
      <button type="submit">Generate Search Plan</button>
    </form>
    <pre id="search-output"></pre>
  `,e.querySelector("#search-form").onsubmit=async n=>{n.preventDefault();const t=e.querySelector("#description").value.trim();if(!t)return;const a=e.querySelector("#search-output");a.textContent="Generating search plan...";try{const i=await l("POST","/api/search",{description:t});a.textContent=JSON.stringify(i,null,2)}catch(i){a.textContent="Error: "+i.message}}}function g(e){e.innerHTML=`<h1>CV & Profile</h1>
    <form id="cv-upload" enctype="multipart/form-data">
      <input type="file" name="cv" accept=".pdf,.docx,.md,.txt" required>
      <button type="submit">Upload CV</button>
    </form>
    <pre id="cv-result"></pre>`,e.querySelector("#cv-upload").onsubmit=async n=>{n.preventDefault();const t=e.querySelector("input[name=cv]").files[0];if(!t)return;const a=new FormData;a.append("cv",t);const r=await(await fetch("/api/cv",{method:"POST",body:a})).json();e.querySelector("#cv-result").textContent=JSON.stringify(r,null,2)}}function v(e){e.innerHTML='<h1>My Listings</h1><div id="listings-table">Loading...</div>',l("GET","/api/listings").then(n=>{e.querySelector("#listings-table").innerHTML=`
      <table><thead><tr><th>#</th><th>Date</th><th>Company</th><th>Role</th><th>Score</th><th>Status</th></tr></thead><tbody>
      ${n.map(t=>`<tr><td>${t.id}</td><td>${t.date}</td><td>${t.company}</td><td>${t.role}</td><td>${t.score}</td><td>${t.status}</td></tr>`).join("")}
      </tbody></table>
    `}).catch(n=>{e.querySelector("#listings-table").textContent="Failed to load: "+n.message})}function S(e){e.innerHTML=`
    <h1>Pipeline</h1>
    <form id="pipeline-add">
      <input type="url" name="url" placeholder="Job URL" required style="width: 100%; margin-bottom: 12px;" />
      <input type="text" name="company" placeholder="Company" style="width: 48%; margin-right: 4%;" />
      <input type="text" name="title" placeholder="Role title" style="width: 48%;" />
      <button type="submit" style="margin-top: 12px;">Add to Pipeline</button>
    </form>
    <div id="pipeline-view">Loading...</div>
  `;const n=e.querySelector("#pipeline-view"),t=e.querySelector("#pipeline-add");t.onsubmit=async i=>{i.preventDefault();const r=t.url.value.trim(),s=t.company.value.trim(),o=t.title.value.trim();if(r)try{const c=await l("POST","/api/pipeline",{url:r,company:s,title:o});c.added?(t.reset(),a()):n.textContent=JSON.stringify(c,null,2)}catch(c){n.textContent="Error: "+c.message}};async function a(){n.textContent="Loading pipeline...";try{const i=await l("GET","/api/pipeline");n.innerHTML=`
        <h2>Pending</h2>
        <ul>${i.pending.map(r=>`<li>${r}</li>`).join("")}</ul>
        <h2>Processed</h2>
        <ul>${i.processed.map(r=>`<li>${r}</li>`).join("")}</ul>
      `}catch(i){n.textContent="Error: "+i.message}}a()}function x(e){const n=localStorage.getItem("token");async function t(a){if(!a)return!1;try{return(await l("GET","/api/auth/verify")).valid===!0}catch{return!1}}t(n).then(a=>{a?u(e):(localStorage.removeItem("token"),localStorage.removeItem("username"),p(e,()=>u(e)))})}function u(e){e.innerHTML=`
    <div class="layout">
      <aside id="sidebar"></aside>
      <main id="main"></main>
    </div>
  `,h(document.getElementById("sidebar"),n),d(document.getElementById("main"));function n(t){t==="dashboard"?d(document.getElementById("main")):t==="scan"?f(document.getElementById("main")):t==="search"?b(document.getElementById("main")):t==="cv"?g(document.getElementById("main")):t==="listings"?v(document.getElementById("main")):t==="pipeline"&&S(document.getElementById("main"))}}x(document.getElementById("app"));
