import urllib.request
import json

def test_api():
    payload = {
        "title": "React Developer Intern",
        "company": "Infosys Limited",
        "location": "Pune",
        "salary": "₹25,000 /month",
        "description": "Selected intern will build responsive UI components. We welcome women wanting to restart their career. POSH compliant workplace.",
        "url": "http://test.local/infosys-intern",
        "contacts": {"emails": ["careers.interns@infosys.com"], "urls": [], "phones": []}
    }

    req = urllib.request.Request(
        "http://127.0.0.1:8000/analyze",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read().decode("utf-8"))
        print(">>> SERVER RESPONSE RECEIVED:")
        print("Verdict     :", data.get("verdict"))
        print("Trust Score :", data.get("trustScore"))
        print("Reasons     :", json.dumps(data.get("reasons"), ensure_ascii=True))
        print("Green Flags :", json.dumps(data.get("transparency", {}).get("greenFlags"), ensure_ascii=True))
        print(">>> API TEST PASSED!")
    except Exception as e:
        print("API Test Failed:", e)

if __name__ == "__main__":
    test_api()
