import json
from playwright.sync_api import sync_playwright

Q = [
 {"text":"Best juice bars in Kilpauk?","namesBusiness":False},
 {"text":"Which juice bar in Kilpauk is good for meeting friends?","namesBusiness":False},
 {"text":"Juice bar in Kilpauk open late at night","namesBusiness":False},
 {"text":"Juice bar in Kilpauk with space for a birthday group of 10","namesBusiness":False},
 {"text":"Kilpauk la nalla juice kadai edhu?","namesBusiness":False},
 {"text":"Is Juice Pump in Kilpauk good? What are its timings and price range?","namesBusiness":True},
]
def ask(route):
    body = json.loads(route.request.post_data)
    q = body["question"]
    named = "Juice Pump" in q or "nalla" in q
    text = ("Juice Pump on Ormes Road is popular and open until 10 PM. Fruit Shop on Greams Road is also good." if named
            else "Try Fruit Shop on Greams Road or Drunken Monkey for juices.")
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"text":text,"sources":[{"title":"district.in","uri":"https://example.com/district"}],"model":"gemini-3.8-flash"}))

def analyze(route):
    body = json.loads(route.request.post_data)
    answers = []
    for a in body["answers"]:
        n = "Juice Pump" in a["text"]
        answers.append({"index":a["index"],"businesses":["Juice Pump","Fruit Shop"] if n else ["Fruit Shop","Drunken Monkey"],"targetNamed":n,"targetRank":1 if n else None})
    out = {"answers":answers,"claims":[{"field":"hours","claim":"Open until 10 PM","status":"conflict","ownerValue":"11 AM to 11 PM, every day","answerIndexes":[i["index"] for i in answers if i["targetNamed"]],"answersDisagree":False,"note":"The AI's closing time is earlier than yours.","sourceUrl":"https://example.com/district"}],"notStated":[{"field":"signature items","ownerValue":"Fresh fruit juices, milkshakes, falooda"}],"gaps":["No answer mentioned late-night hours."],"summary":"The AI names you when asked about Kilpauk but not in city-wide questions."}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(out))

fixes = {"googleDescription":"Juice Pump serves fresh fruit juices, milkshakes and falooda in Kilpauk, Chennai. Open 11 AM to 11 PM every day.","marketplaceDescription":"Fresh juices and falooda. Open 11 AM to 11 PM.","hoursLine":"11 AM to 11 PM, every day","faqs":[{"question":"What time does Juice Pump close?","answer":"We are open 11 AM to 11 PM every day."},{"question":"What do you serve?","answer":"Fresh fruit juices, milkshakes and falooda."},{"question":"Where are you?","answer":"Kilpauk, Chennai."}],"needsFromOwner":["Your Egmore opening hours, if different"],"unverifiedNumbers":["20"]}

with sync_playwright() as p:
    b = p.chromium.launch()
    errs = []
    for label, vp in [("desktop",{"width":1280,"height":900}),("mobile",{"width":390,"height":844})]:
        pg = b.new_page(viewport=vp)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route("**/api/questions", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"questions":Q,"source":"gemini","model":"gemini-3.8-flash"})))
        pg.route("**/api/ask", ask)
        pg.route("**/api/analyze", analyze)
        pg.route("**/api/fixes", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(fixes)))
        pg.goto("http://localhost:3100")
        pg.click("text=Try an example")
        pg.click("button:has-text('Run the check')")
        pg.wait_for_selector("text=Paste-ready fixes", timeout=15000)
        pg.wait_for_selector("text=Google Business Profile description", timeout=15000)
        txt = pg.inner_text("main")
        print(label, "named line:", [l for l in txt.split("\n") if "answers" in l and "of" in l][:2])
        print(label, "has conflict card:", "Conflicts with your facts" in txt, "| warning shown:", "Check these numbers" in txt)
        pg.screenshot(path=f"/tmp/ui_{label}.png", full_page=True)
    # error path: missing key
    pg = b.new_page(viewport={"width":1280,"height":900})
    pg.route("**/api/questions", lambda r: r.fulfill(status=500, content_type="application/json", body=json.dumps({"error":{"code":"missing_key","message":"The server has no Gemini API key."}})))
    pg.goto("http://localhost:3100")
    pg.click("text=Try an example"); pg.click("button:has-text('Run the check')")
    pg.wait_for_selector("text=Something stopped the check", timeout=8000)
    print("error path shows message:", "no Gemini API key" in pg.inner_text("main"))
    # empty form validation
    pg2 = b.new_page(); pg2.goto("http://localhost:3100"); pg2.click("button:has-text('Run the check')")
    print("validation:", pg2.inner_text("[role=alert]"))
    print("page errors:", errs)
    b.close()
