"""
codebee 안티치트 검증용 자동 제출 봇 (팀 26s-w1-c2-06의 승인 하에 실행).

취약점 요약
-----------
1. 정답/오답 스니펫 전체 목록이 공개 저장소(backend/game/management/commands/seed_snippets.py)에
   하드코딩돼 있어, 타이핑 실력과 무관하게 무엇이 "정답"인지 사전에 100% 알 수 있다.
2. 서버는 WebSocket으로 들어온 code.submit 메시지가 실제 사람이 화면을 보고 입력한 것인지
   전혀 검증하지 않는다 (검증하는 건 spawn_ts/duration 시간창 안인지 뿐).
   => code.spawn 이벤트를 받는 즉시 정답 목록과 대조해 자동으로 code.submit을 보내면
      사람보다 항상 빠르게 선점할 수 있다.
3. 한 판의 스니펫 풀은 재사용 없이 소진되므로, 정답 51개를 전부 선점하면 이론상 최대
   51 * 500 = 25,500점이 상한이다.

사용법
------
    pip install requests websockets

    # 호스트로 방을 새로 만들고 상대 입장을 기다렸다가 자동 시작
    python codebee_autoclicker.py --base-url http://localhost:8000 \
        --ws-url ws://localhost:8000 --username bot1 --password botpass1 --host

    # 이미 있는 방에 참가만 하고 자동 채점 (게임 시작은 호스트가 함)
    python codebee_autoclicker.py --base-url http://localhost:8000 \
        --ws-url ws://localhost:8000 --username bot2 --password botpass2 --join ABCD12

주의: 반드시 팀의 허락을 받은 환경(로컬 docker-compose 또는 팀이 지정한 테스트 방)에서만
실행할 것 — 실제 서비스 중인 남의 계정/방에 무단으로 접속하지 말 것.
"""

import argparse
import asyncio
import json
import sys

import requests
import websockets

# seed_snippets.py의 SNIPPET_PAIRS 중 "정답" 쪽만 뽑은 화이트리스트.
# 저장소가 공개돼 있어 사전에 전부 알 수 있다는 것 자체가 취약점 1번의 증거.
CORRECT_SNIPPETS = {
    "x = 1", "y = 2", "print(x)", "print('hi')", "if x == 1:", "if x > 0:",
    "if x != y:", "while True:", "while x < 10:", "for i in range(10):",
    "for i in items:", "def add(a, b):", "def greet(name):", "return a + b",
    "return None", "import os", "import sys", "from math import sqrt",
    "class Dog:", "class Cat(Animal):", "self.name = name", "try:",
    "except ValueError:", "finally:", "raise ValueError('bad')", "assert x > 0",
    "lambda x: x * 2", "nums = [1, 2, 3]", "nums.append(4)", "d = {'a': 1}",
    "d.get('a')", "s = 'hello'", "s.upper()", "s.split(',')", "len(nums)",
    "range(0, 10, 2)", "sorted(nums)", "x += 1", "x -= 1", "x **= 2",
    "a, b = b, a", "not x", "x and y", "x or y", "None is not x",
    "isinstance(x, int)", "super().__init__()", "with open('f') as f:",
    "yield x", "async def fetch():", "await fetch()",
}


def login(base_url, username, password):
    session = requests.Session()
    session.get(f"{base_url}/api/csrf/")
    csrftoken = session.cookies.get("csrftoken")
    headers = {"X-CSRFToken": csrftoken} if csrftoken else {}

    resp = session.post(
        f"{base_url}/api/login/",
        json={"username": username, "password": password},
        headers=headers,
    )
    if resp.status_code != 200:
        # 계정이 없으면 즉석 가입 후 재로그인
        session.post(
            f"{base_url}/api/signup/",
            json={"username": username, "password": password},
            headers=headers,
        )
        resp = session.post(
            f"{base_url}/api/login/",
            json={"username": username, "password": password},
            headers=headers,
        )
    resp.raise_for_status()
    return session


def create_or_join_room(session, base_url, room_code, csrftoken):
    headers = {"X-CSRFToken": csrftoken} if csrftoken else {}
    if room_code:
        resp = session.post(f"{base_url}/api/rooms/{room_code}/join/", headers=headers)
        resp.raise_for_status()
        return resp.json()["code"]
    resp = session.post(f"{base_url}/api/rooms/", headers=headers)
    resp.raise_for_status()
    return resp.json()["code"]


async def run_bot(ws_url, room_code, session, is_host):
    cookie_header = "; ".join(f"{k}={v}" for k, v in session.cookies.items())
    uri = f"{ws_url}/ws/room/{room_code}/"

    async with websockets.connect(uri, additional_headers={"Cookie": cookie_header}) as ws:
        print(f"[+] 방 {room_code}에 연결됨 (host={is_host})")

        if is_host:
            await ws.send(json.dumps({"type": "game.start"}))

        my_score = 0
        while True:
            try:
                raw = await ws.recv()
            except websockets.ConnectionClosed:
                break
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "code.spawn":
                text = data["text"]
                if text in CORRECT_SNIPPETS:
                    # 사람이 읽고 타이핑하는 지연 없이 즉시 제출 — 이게 바로 검증하려는 취약점.
                    await ws.send(json.dumps({"type": "code.submit", "text": text}))
                    print(f"    -> 즉시 제출: {text!r}")

            elif msg_type == "code.result":
                print(f"    <- 판정: {data}")

            elif msg_type == "game.over":
                print(f"[!] 게임 종료: {data}")
                break

            elif msg_type == "error":
                print(f"[x] 서버 에러: {data}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True, help="예: http://localhost:8000")
    parser.add_argument("--ws-url", required=True, help="예: ws://localhost:8000")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--host", action="store_true", help="방을 새로 만들고 호스트로 시작")
    group.add_argument("--join", metavar="ROOM_CODE", help="기존 방에 참가")
    args = parser.parse_args()

    session = login(args.base_url, args.username, args.password)
    csrftoken = session.cookies.get("csrftoken")
    room_code = create_or_join_room(session, args.base_url, args.join, csrftoken)
    print(f"[+] 방 코드: {room_code}")

    asyncio.run(run_bot(args.ws_url, room_code, session, is_host=args.host))


if __name__ == "__main__":
    sys.exit(main())
