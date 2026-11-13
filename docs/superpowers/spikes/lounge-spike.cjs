// THROWAWAY SPIKE: YouTube Lounge API against a Cast device running the YouTube app.
// Usage: node lounge-spike.cjs <host> <path-to-castv2> [testVideoId]
// Prints the app/screen info, the lounge session events (from the bind reply),
// then (if testVideoId) addVideo -> events -> removeVideo -> events.
const { Client } = require(process.argv[3]);
const host = process.argv[2];
const testVideoId = process.argv[4];

const YT_APP_ID = "233637DE";
const MDX_NS = "urn:x-cast:com.google.youtube.mdx";
const BASE = "https://www.youtube.com/api/lounge";

function getScreenId() {
    return new Promise((resolve, reject) => {
        const c = new Client();
        const timer = setTimeout(() => reject(new Error("cast timeout")), 10000);
        c.connect(host, () => {
            const ch = (dst, ns) => c.createChannel("sender-spike", dst, ns, "JSON");
            ch("receiver-0", "urn:x-cast:com.google.cast.tp.connection").send({ type: "CONNECT" });
            const rcv = ch("receiver-0", "urn:x-cast:com.google.cast.receiver");
            rcv.once("message", m => {
                const app = m.status.applications?.[0];
                console.log("RUNNING APP:", app?.appId, app?.displayName);
                if (app?.appId !== YT_APP_ID) {
                    clearTimeout(timer); c.close();
                    return reject(new Error("YouTube app is not running on this device"));
                }
                ch(app.transportId, "urn:x-cast:com.google.cast.tp.connection").send({ type: "CONNECT" });
                const mdx = ch(app.transportId, MDX_NS);
                mdx.on("message", s => {
                    if (s.type !== "mdxSessionStatus") return;
                    clearTimeout(timer); c.close();
                    resolve(s.data.screenId);
                });
                mdx.send({ type: "getMdxSessionStatus" });
            });
            rcv.send({ type: "GET_STATUS", requestId: 1 });
        });
    });
}

let rid = 0, reqCount = 0, sid, gsessionid, loungeToken;

async function post(path, params, body) {
    const url = `${BASE}/${path}?${new URLSearchParams(params)}`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Origin: "https://www.youtube.com/",
            ...(loungeToken ? { "X-YouTube-LoungeId-Token": loungeToken } : {})
        },
        body: new URLSearchParams(body)
    });
    rid++;
    return { status: res.status, text: await res.text() };
}

/** Parses the chunked bind reply: "<len>\n[[id,[event,...]],...]" */
function parseEvents(text) {
    const events = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (!/^\d+$/.test(lines[i].trim())) continue;
        try {
            const chunk = JSON.parse(lines.slice(i + 1).join("\n").slice(0, Number(lines[i])));
            for (const [, ev] of chunk) events.push(ev);
        } catch { /* partial chunk */ }
    }
    return events;
}

async function bind() {
    rid = 0; reqCount = 0;
    const { status, text } = await post("bc/bind", { RID: rid, VER: 8, CVER: 1 }, {
        device: "REMOTE_CONTROL", id: "fxcastspike0000000000000000", name: "fx_cast spike",
        "mdx-version": 3, pairing_type: "cast", app: "android-phone-13.14.55"
    });
    sid = text.match(/"c","(.*?)","/)?.[1];
    gsessionid = text.match(/"S","(.*?)"]/)?.[1];
    return { status, events: parseEvents(text) };
}

function printEvents(label, events) {
    console.log(`\n== ${label}: ${events.length} events`);
    for (const ev of events) {
        const [name, data] = ev;
        if (["c", "S", "noop", "loungeStatus"].includes(name)) { console.log(" ", name); continue; }
        console.log(" ", name, JSON.stringify(data)?.slice(0, 400));
    }
}

async function command(action, params) {
    const body = { count: 1, ofs: reqCount, req0__sc: action };
    for (const [k, v] of Object.entries(params)) body[`req0_${k}`] = v;
    const res = await post("bc/bind", { SID: sid, gsessionid, RID: rid, VER: 8, CVER: 1 }, body);
    reqCount++;
    console.log(`\n>> ${action} ${JSON.stringify(params)} -> HTTP ${res.status}`);
}

(async () => {
    const screenId = await getScreenId();
    console.log("SCREEN ID:", screenId ? "received" : "missing");

    const tok = await post("pairing/get_lounge_token_batch", {}, { screen_ids: screenId });
    loungeToken = JSON.parse(tok.text).screens?.[0]?.loungeToken;
    console.log("LOUNGE TOKEN:", loungeToken ? "received" : `missing (HTTP ${tok.status})`);

    let b = await bind();
    console.log("BIND:", b.status, "sid:", !!sid, "gsessionid:", !!gsessionid);
    printEvents("initial state", b.events);

    if (!testVideoId) return;

    await command("addVideo", { videoId: testVideoId });
    b = await bind();
    printEvents("after addVideo", b.events);

    await command("removeVideo", { videoId: testVideoId });
    b = await bind();
    printEvents("after removeVideo", b.events);
})().catch(err => { console.error("SPIKE FAILED:", err.message); process.exit(1); });
