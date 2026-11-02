import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type FC, useEffect, useRef } from 'react';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import type { CardOptions } from 'types/cardOptions';
import 'elements/emby-scroller/emby-scroller';
import 'elements/emby-itemscontainer/emby-itemscontainer';

// There seems to be some compatibility issues here between
// React and our legacy web components, so we need to inject
// them as an html string for now =/
const createScroller = ({ title = '' }) => ({
    __html: `<h2 class="sectionTitle sectionTitle-cards focuscontainer-x padded-left padded-right">${title}</h2>
    <div is="emby-scroller" data-horizontal="true" data-centerfocus="card" class="padded-top-focusscale padded-bottom-focusscale">
    <div is="emby-itemscontainer" class="focuscontainer-x itemsContainer scrollSlider"></div>
</div>`
});

interface SearchResultsRowProps {
    title?: string;
    items?: BaseItemDto[];
    cardOptions?: CardOptions;
}

interface ScrollerLike {
    reload: () => void;
    slideTo?: (pos: number, immediate?: boolean) => void;
    getScrollPosition?: () => number;
}

type ScrollerElement = HTMLDivElement & {
    scroller?: ScrollerLike;
};

/*
 * The legacy scroller always starts at position 0 when its element is created,
 * and the custom element is only upgraded on a later frame. Rows therefore
 * remember their offset outside of React and restore it after the upgrade.
 */
const scrollPositions = new Map<string, number>();

const SearchResultsRow: FC<SearchResultsRowProps> = ({ title, items = [], cardOptions = {} }) => {
    const element = useRef<HTMLDivElement>(null);
    const lastSignature = useRef<string>();

    useEffect(() => {
        const key = title ?? '';
        const root = element.current;
        const scrollerEl = root?.querySelector('[is="emby-scroller"]') as ScrollerElement | null;

        if (!scrollerEl) {
            return;
        }

        // Skip the rebuild when the row content is unchanged, so a parent
        // re-render cannot throw away the scroll offset.
        const signature = `${cardOptions.shape}|${cardOptions.scalable}|${items.map((item) => item.Id).join(',')}`;
        const contentChanged = signature !== lastSignature.current;

        if (contentChanged) {
            lastSignature.current = signature;

            cardBuilder.buildCards(items, {
                itemsContainer: root?.querySelector('.itemsContainer'),
                ...cardOptions
            });
        }

        let cancelled = false;
        let restoreHandle: number | undefined;

        const rememberPosition = () => {
            const pos = scrollerEl.scroller?.getScrollPosition?.();
            if (typeof pos === 'number') {
                scrollPositions.set(key, pos);
            }
        };

        // The element upgrade (and with it the scroller instance) happens on a
        // later frame, so wait for it before reloading and restoring the offset.
        const whenScrollerReady = (callback: (scroller: ScrollerLike) => void, attempt = 0) => {
            if (cancelled) {
                return;
            }

            if (scrollerEl.scroller) {
                callback(scrollerEl.scroller);
                return;
            }

            if (attempt >= 30) {
                return;
            }

            restoreHandle = window.requestAnimationFrame(() => whenScrollerReady(callback, attempt + 1));
        };

        whenScrollerReady((scroller) => {
            if (contentChanged) {
                scroller.reload();
            }

            // Track positions as the user scrolls: native mode fires 'scroll',
            // transform mode fires the custom 'scrollanimate' event.
            scrollerEl.addEventListener('scroll', rememberPosition, { passive: true });
            scrollerEl.addEventListener('scrollanimate', rememberPosition, { passive: true });

            const saved = scrollPositions.get(key);
            if (saved) {
                scroller.slideTo?.(saved, true);
            }
        });

        return () => {
            cancelled = true;

            if (restoreHandle !== undefined) {
                window.cancelAnimationFrame(restoreHandle);
            }

            rememberPosition();
            scrollerEl.removeEventListener('scroll', rememberPosition);
            scrollerEl.removeEventListener('scrollanimate', rememberPosition);
        };
    }, [cardOptions, items, title]);

    return (
        <div
            ref={element}
            className='verticalSection'
            dangerouslySetInnerHTML={createScroller({ title })}
        />
    );
};

export default SearchResultsRow;
