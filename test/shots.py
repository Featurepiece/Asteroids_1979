# Opens the built page in headless Chromium, plays a little, saves screenshots.
import sys, os
from playwright.sync_api import sync_playwright

page_url = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
out = sys.argv[1] if len(sys.argv) > 1 else '.'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1024, 'height': 768})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(page_url)
    pg.wait_for_timeout(400)
    pg.screenshot(path=f'{out}/0_splash.png')
    pg.mouse.click(500, 400)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{out}/1_attract.png')
    pg.keyboard.press('Digit5')
    pg.wait_for_timeout(300)
    pg.screenshot(path=f'{out}/2_credit.png')
    pg.keyboard.press('Digit1')
    pg.wait_for_timeout(2600)
    pg.screenshot(path=f'{out}/3_start.png')
    pg.keyboard.down('ArrowLeft'); pg.wait_for_timeout(300); pg.keyboard.up('ArrowLeft')
    pg.keyboard.down('ArrowUp')
    for i in range(6):
        pg.keyboard.press('Space'); pg.wait_for_timeout(90)
    pg.screenshot(path=f'{out}/4_thrust_fire.png')
    pg.keyboard.up('ArrowUp')
    for i in range(40):
        pg.keyboard.press('Space'); pg.wait_for_timeout(120)
        if i % 10 == 0:
            pg.keyboard.down('ArrowRight'); pg.wait_for_timeout(200); pg.keyboard.up('ArrowRight')
    pg.screenshot(path=f'{out}/5_play.png')
    pg.keyboard.press('KeyO'); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{out}/6_options.png')
    pg.keyboard.press('KeyO')
    state = pg.evaluate('() => ({ ac: typeof audio === "object" && audio ? audio.ac.state : null, worklet: !!(audio && audio.post), segs: V.segs.length })')
    print('state', state)
    print('errors', errors)
    b.close()
