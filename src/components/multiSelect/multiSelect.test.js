import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Keep the module graph small: multiSelect pulls in the whole app shell otherwise.
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: {
        currentApiClient: () => ({
            getCurrentUser: () => Promise.resolve({ Policy: {} }),
            getCurrentUserId: () => 'user',
            getItem: () => Promise.resolve({}),
            getItems: () => Promise.resolve({ Items: [] })
        })
    }
}));
vi.mock('../apphost', () => ({ appHost: { supports: () => false } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key) => key } }));
vi.mock('utils/events', () => ({ default: { trigger: vi.fn() }, Events: { trigger: vi.fn() } }));
vi.mock('../../scripts/browser', () => ({ default: { touch: false, safari: false } }));
vi.mock('../../scripts/datetime', () => ({ default: { toLocaleString: (value) => String(value) } }));
vi.mock('../loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('../alert', () => ({ default: () => Promise.resolve() }));
vi.mock('../confirm/confirm', () => ({ default: () => Promise.resolve() }));
vi.mock('../toast/toast', () => ({ default: vi.fn() }));
vi.mock('../itemHelper', () => ({ default: { canRefreshMetadata: () => false } }));
vi.mock('../../elements/emby-checkbox/emby-checkbox', () => ({}));

let MultiSelect;
let startMultiSelect;
let stopMultiSelect;

describe('multiSelect range and paint selection', () => {
    let cards;

    beforeAll(async () => {
        globalThis.__WEBPACK_SERVE__ = false;
        const module = await import('./multiSelect');
        MultiSelect = module.default;
        startMultiSelect = module.startMultiSelect;
        stopMultiSelect = module.stopMultiSelect;
    });

    function buildDom(count) {
        document.body.innerHTML = '<div id="test-container"></div>';
        const container = document.getElementById('test-container');

        for (let i = 0; i < count; i++) {
            const card = document.createElement('div');
            card.className = 'card';
            card.setAttribute('data-id', `item-${i}`);
            card.innerHTML = '<div class="cardBox"><div class="cardContent"></div></div>';
            container.appendChild(card);
            cards.push(card);
        }

        new MultiSelect({ container: container, bindOnClick: true });
        return container;
    }

    function checkbox(index) {
        return cards[index].querySelector('.chkItemSelect');
    }

    function checkedIndexes() {
        return cards
            .map((card, index) => (checkbox(index)?.checked ? index : -1))
            .filter(index => index >= 0);
    }

    function clickCard(index, shiftKey = false) {
        cards[index].querySelector('.cardBox').dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            shiftKey: shiftKey
        }));
    }

    function pointer(type, index, x, y) {
        const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
        });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        Object.defineProperty(event, 'pointerType', { value: 'touch' });
        cards[index].querySelector('.cardBox').dispatchEvent(event);
        return event;
    }

    beforeEach(() => {
        stopMultiSelect();
        cards = [];
        document.body.innerHTML = '';
    });

    function flush() {
        return new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    }

    test('shift+click selects the whole range from the anchor', async () => {
        buildDom(6);
        startMultiSelect(cards[1]);
        await flush();

        // jsdom has no layout, so make every checkbox look visible to the range code.
        document.querySelectorAll('.chkItemSelect').forEach((el) => {
            el.getBoundingClientRect = () => ({ width: 20, height: 20, top: 0, left: 0, right: 20, bottom: 20 });
        });

        expect(checkedIndexes()).toEqual([1]);

        clickCard(4, true);

        expect(checkedIndexes()).toEqual([1, 2, 3, 4]);
        stopMultiSelect();
    });

    test('a plain click still toggles a single card', async () => {
        buildDom(4);
        startMultiSelect(cards[0]);
        await flush();

        clickCard(2);

        expect(checkedIndexes()).toEqual([0, 2]);
        stopMultiSelect();
    });

    test('long pressing another card while selecting keeps marks and count in sync', async () => {
        buildDom(4);
        startMultiSelect(cards[0]);
        await flush();

        startMultiSelect(cards[2]);
        await flush();

        expect(checkedIndexes()).toEqual([0, 2]);
        expect(document.querySelector('.itemSelectionCount').innerHTML).toBe('2');
        stopMultiSelect();
    });

    test('the long press gesture keeps painting after selection mode starts', async () => {
        buildDom(5);

        // Finger goes down before selection mode exists...
        pointer('pointerdown', 0, 10, 10);
        document.elementFromPoint = () => cards[3].querySelector('.cardBox');

        // ...the long press timer enters selection mode while the finger is still down...
        startMultiSelect(cards[0]);
        await flush();

        // ...and the rest of the gesture paints.
        pointer('pointermove', 0, 60, 12);

        expect(checkedIndexes()).toEqual([0, 3]);
        pointer('pointerup', 0, 60, 12);
        stopMultiSelect();
    });

    test('dragging across cards paints the same state', async () => {
        buildDom(5);
        startMultiSelect(cards[1]);
        await flush();

        document.elementFromPoint = () => cards[2].querySelector('.cardBox');

        // Pressing an unselected card paints "selected" over everything it touches.
        pointer('pointerdown', 0, 10, 10);
        pointer('pointermove', 0, 60, 12);

        expect(checkedIndexes()).toEqual([0, 1, 2]);

        pointer('pointerup', 0, 60, 12);
        stopMultiSelect();
    });

    test('a vertical touch drag does not paint', async () => {
        buildDom(4);
        startMultiSelect(cards[0]);
        await flush();
        document.elementFromPoint = () => cards[2].querySelector('.cardBox');

        pointer('pointerdown', 0, 10, 10);
        pointer('pointermove', 0, 12, 70);

        expect(checkedIndexes()).toEqual([0]);
        pointer('pointerup', 0, 12, 70);
        stopMultiSelect();
    });
});
