import dialogHelper from '../dialogHelper/dialogHelper';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import toast from '../toast/toast';
import '../../elements/emby-select/emby-select';
import '../../elements/emby-input/emby-input';
import '../../elements/emby-button/emby-button';
import '../formdialog.scss';

function createDialog(title) {
    const dlg = dialogHelper.createDialog({
        removeOnClose: true,
        scrollY: false,
        size: 'small'
    });

    dlg.classList.add('formDialog');
    dlg.innerHTML = globalize.translateHtml(`
        <div class="formDialogHeader">
            <button is="paper-icon-button-light" class="btnCancel hide-mouse-idle-tv" tabindex="-1" title="${globalize.translate('ButtonBack')}">
                <span class="material-icons arrow_back" aria-hidden="true"></span>
            </button>
            <h3 class="formDialogHeaderTitle">${title}</h3>
        </div>
    `);

    return dlg;
}

function attachCancel(dlg) {
    dlg.querySelectorAll('.btnCancel').forEach((btn) => {
        btn.addEventListener('click', () => dialogHelper.close(dlg));
    });
}

function pollJob(apiClient, jobId) {
    let attempts = 0;
    const timer = setInterval(async () => {
        attempts += 1;
        if (attempts > 1800) {
            clearInterval(timer);
            return;
        }

        try {
            const job = await apiClient.getJSON(apiClient.getUrl(`VideoTools/Jobs/${jobId}`));
            if (job.Status === 'Completed') {
                clearInterval(timer);
                toast(globalize.translate('VideoToolsCompleted', job.OutputPath));
            } else if (job.Status === 'Failed') {
                clearInterval(timer);
                const error = (job.Error || '').slice(-300);
                toast(globalize.translate('VideoToolsFailed', error));
            }
        } catch (err) {
            console.warn('[videotools] failed to poll job', err);
            clearInterval(timer);
        }
    }, 5000);
}

function startJob(apiClient, url, successMessage) {
    return apiClient.ajax({
        type: 'POST',
        url: url,
        dataType: 'json'
    }).then((job) => {
        toast(successMessage);
        pollJob(apiClient, job.Id);
        return job;
    });
}

export function showTranscode(options) {
    return new Promise((resolve) => {
        const apiClient = ServerConnections.getApiClient(options.serverId);
        const itemIds = options.itemIds && options.itemIds.length ? options.itemIds : [options.itemId];
        const isBatch = itemIds.length > 1;
        const title = isBatch ?
            `${globalize.translate('Transcode')} (${itemIds.length})` :
            globalize.translate('Transcode');
        const dlg = createDialog(title);

        dlg.innerHTML += globalize.translateHtml(`
            <form class="formDialogContent" style="padding:1.5em 2em;">
                <div class="selectContainer">
                    <label class="selectLabel" for="selectCodec">${globalize.translate('VideoToolsCodec')}</label>
                    <select is="emby-select" id="selectCodec" class="emby-select-withcolor emby-select">
                        <option value="h265" selected>H.265 (Intel QSV)</option>
                        <option value="av1">AV1 (software, slow)</option>
                    </select>
                </div>
                <div class="selectContainer">
                    <label class="selectLabel" for="selectResolution">${globalize.translate('VideoToolsMaxResolution')}</label>
                    <select is="emby-select" id="selectResolution" class="emby-select-withcolor emby-select">
                        <option value="1080p" selected>1080p</option>
                        <option value="4k">4K (2160p)</option>
                    </select>
                </div>
                <div class="inputContainer">
                    <label class="inputLabel inputLabelUnfocused" for="txtBitrate">${globalize.translate('VideoToolsBitrate')}</label>
                    <input is="emby-input" type="number" id="txtBitrate" min="100" max="200000" step="100" value="3000" />
                </div>
                ${isBatch ? `<div class="fieldDescription">${globalize.translate('VideoToolsBatchHint', itemIds.length)}</div>` : ''}
                <div class="fieldDescription">${globalize.translate('VideoToolsTranscodeHint')}</div>
                <div style="margin-top:2em;">
                    <button is="emby-button" type="button" class="button-cancel block btnCancel" style="background-color:#424242;color:#ffffff;">${globalize.translate('ButtonCancel')}</button>
                    <button is="emby-button" type="submit" class="button-submit block btnStart">${globalize.translate('ButtonStart')}</button>
                </div>
            </form>
        `);

        attachCancel(dlg);

        dlg.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();

            const codec = dlg.querySelector('#selectCodec').value;
            const resolution = dlg.querySelector('#selectResolution').value;
            const bitrate = Number(dlg.querySelector('#txtBitrate').value);

            if (!Number.isFinite(bitrate) || bitrate < 100 || bitrate > 200000) {
                toast(globalize.translate('VideoToolsInvalidBitrate'));
                return;
            }

            dialogHelper.close(dlg);

            const params = {
                codec: codec,
                bitrateKbps: Math.round(bitrate),
                resolution: resolution
            };

            if (isBatch) {
                apiClient.ajax({
                    type: 'POST',
                    url: apiClient.getUrl('VideoTools/Transcode', params),
                    data: JSON.stringify(itemIds),
                    contentType: 'application/json',
                    dataType: 'json'
                }).then((result) => {
                    const added = result?.Added || 0;
                    const skipped = result?.Skipped || 0;
                    toast(skipped > 0 ?
                        globalize.translate('VideoToolsBatchQueuedSkipped', added, skipped) :
                        globalize.translate('VideoToolsBatchQueued', added));
                    resolve(result);
                }, (err) => {
                    console.error('[videotools] batch transcode failed', err);
                    toast(globalize.translate('VideoToolsRequestFailed'));
                    resolve();
                });
                return;
            }

            startJob(
                apiClient,
                apiClient.getUrl(`VideoTools/${options.itemId}/Transcode`, params),
                globalize.translate('VideoToolsStarted')
            ).then(resolve, (err) => {
                console.error('[videotools] transcode failed', err);
                toast(globalize.translate('VideoToolsRequestFailed'));
                resolve();
            });
        });

        dialogHelper.open(dlg).then(() => resolve());
    });
}

function formatPreviewTime(seconds) {
    return `${seconds.toFixed(1)}s`;
}

/**
 * Wires the two cut previews: the first kept frame (start trim) and the last kept frame (end trim).
 * A preview stays hidden while its trim value is 0.
 */
function setupCutPreviews(options) {
    const { dlg, apiClient, itemId, getDuration } = options;
    const startInput = dlg.querySelector('#txtStartTrim');
    const endInput = dlg.querySelector('#txtEndTrim');
    const rotationSelect = dlg.querySelector('#selectRotation');
    const boxes = {
        front: dlg.querySelector('#cutPreviewFront'),
        back: dlg.querySelector('#cutPreviewBack')
    };
    const tokens = { front: 0, back: 0 };
    const timers = { front: null, back: null };

    function hide(role) {
        const box = boxes[role];
        tokens[role] += 1;
        if (timers[role]) {
            clearTimeout(timers[role]);
            timers[role] = null;
        }
        box.style.display = 'none';
        box.dataset.time = '';
        const img = box.querySelector('img');
        img.onload = null;
        img.onerror = null;
        img.removeAttribute('src');
    }

    function load(role, seconds) {
        const box = boxes[role];
        if (!Number.isFinite(seconds) || seconds <= 0) {
            hide(role);
            return;
        }

        const img = box.querySelector('img');
        const status = box.querySelector('.cutPreviewStatus');
        const timeLabel = box.querySelector('.cutPreviewTime');
        const token = ++tokens[role];

        box.style.display = '';
        box.dataset.time = String(seconds);
        timeLabel.textContent = formatPreviewTime(seconds);
        status.textContent = globalize.translate('VideoToolsPreviewLoading');
        status.style.display = '';
        img.style.visibility = 'hidden';

        const url = apiClient.getUrl(`VideoTools/${itemId}/Frame`, {
            timeSeconds: seconds.toFixed(3),
            maxWidth: 480,
            rotation: Number(rotationSelect.value || 0),
            ApiKey: apiClient.accessToken()
        });

        img.onload = () => {
            if (token !== tokens[role]) return;
            status.style.display = 'none';
            img.style.visibility = '';
        };
        img.onerror = () => {
            if (token !== tokens[role]) return;
            status.textContent = globalize.translate('VideoToolsPreviewFailed');
            status.style.display = '';
            img.style.visibility = 'hidden';
        };
        img.src = url;
    }

    function schedule(role, seconds) {
        if (timers[role]) {
            clearTimeout(timers[role]);
        }
        timers[role] = setTimeout(() => {
            timers[role] = null;
            load(role, seconds);
        }, 400);
    }

    function refresh() {
        const start = Number(startInput.value || 0);
        const end = Number(endInput.value || 0);
        const total = getDuration();

        if (Number.isFinite(start) && start > 0) {
            schedule('front', start);
        } else {
            hide('front');
        }

        if (Number.isFinite(end) && end > 0 && total > 0) {
            // Stay just inside the kept part so the frame is the last one that survives the cut.
            const time = total - end - 0.05;
            if (time > 0) {
                schedule('back', time);
            } else {
                hide('back');
            }
        } else {
            hide('back');
        }
    }

    startInput.addEventListener('input', refresh);
    endInput.addEventListener('input', refresh);
    rotationSelect.addEventListener('change', () => {
        ['front', 'back'].forEach((role) => {
            const time = Number(boxes[role].dataset.time || 0);
            if (time > 0) {
                load(role, time);
            }
        });
    });

    refresh();

    return { refresh };
}

export function showCut(options) {
    return new Promise((resolve) => {
        const apiClient = ServerConnections.getApiClient(options.serverId);
        let duration = options.durationTicks ? options.durationTicks / 10000000 : 0;
        const dlg = createDialog(globalize.translate('CutVideo'));

        const durationText = duration > 0 ?
            globalize.translate('VideoToolsDuration', Math.round(duration)) :
            '';

        dlg.innerHTML += globalize.translateHtml(`
            <form class="formDialogContent" style="padding:1.5em 2em;">
                <div class="fieldDescription" id="cutDurationText">${durationText}</div>
                <div class="inputContainer">
                    <label class="inputLabel inputLabelUnfocused" for="txtStartTrim">${globalize.translate('VideoToolsStartTrim')}</label>
                    <input is="emby-input" type="number" id="txtStartTrim" min="0" step="0.1" value="0" />
                </div>
                <div class="inputContainer">
                    <label class="inputLabel inputLabelUnfocused" for="txtEndTrim">${globalize.translate('VideoToolsEndTrim')}</label>
                    <input is="emby-input" type="number" id="txtEndTrim" min="0" step="0.1" value="0" />
                </div>
                <div id="cutPreviews" style="display:flex;gap:.75em;margin:.25em 0 .75em;">
                    <div id="cutPreviewFront" style="display:none;flex:1 1 0;min-width:0;">
                        <div class="fieldDescription" style="margin:0 0 .3em;">${globalize.translate('VideoToolsPreviewFront')}</div>
                        <div style="position:relative;background:#000;border-radius:4px;overflow:hidden;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                            <img alt="" style="max-width:100%;max-height:100%;display:block;" />
                            <div class="cutPreviewStatus" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cfcfcf;font-size:.8em;background:rgba(0,0,0,.35);"></div>
                        </div>
                        <div class="cutPreviewTime fieldDescription" style="margin:.2em 0 0;"></div>
                    </div>
                    <div id="cutPreviewBack" style="display:none;flex:1 1 0;min-width:0;">
                        <div class="fieldDescription" style="margin:0 0 .3em;">${globalize.translate('VideoToolsPreviewBack')}</div>
                        <div style="position:relative;background:#000;border-radius:4px;overflow:hidden;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                            <img alt="" style="max-width:100%;max-height:100%;display:block;" />
                            <div class="cutPreviewStatus" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cfcfcf;font-size:.8em;background:rgba(0,0,0,.35);"></div>
                        </div>
                        <div class="cutPreviewTime fieldDescription" style="margin:.2em 0 0;"></div>
                    </div>
                </div>
                <div class="selectContainer">
                    <label class="selectLabel" for="selectRotation">${globalize.translate('VideoToolsRotation')}</label>
                    <select is="emby-select" id="selectRotation" class="emby-select-withcolor emby-select">
                        <option value="0" selected>${globalize.translate('VideoToolsRotationNone')}</option>
                        <option value="90">${globalize.translate('VideoToolsRotation90')}</option>
                        <option value="180">${globalize.translate('VideoToolsRotation180')}</option>
                        <option value="270">${globalize.translate('VideoToolsRotation270')}</option>
                    </select>
                </div>
                <div class="fieldDescription">${globalize.translate('VideoToolsCutHint')}</div>
                <div style="margin-top:2em;">
                    <button is="emby-button" type="button" class="button-cancel block btnCancel" style="background-color:#424242;color:#ffffff;">${globalize.translate('ButtonCancel')}</button>
                    <button is="emby-button" type="submit" class="button-submit block btnStart">${globalize.translate('ButtonStart')}</button>
                </div>
            </form>
        `);

        attachCancel(dlg);

        const previews = setupCutPreviews({
            dlg: dlg,
            apiClient: apiClient,
            itemId: options.itemId,
            getDuration: () => duration
        });

        if (!Number.isFinite(duration) || duration <= 0) {
            // The end preview needs the duration; fetch it when the caller did not provide it.
            apiClient.getItem(apiClient.getCurrentUserId(), options.itemId).then((item) => {
                if (item && item.RunTimeTicks) {
                    duration = item.RunTimeTicks / 10000000;
                    const text = dlg.querySelector('#cutDurationText');
                    if (text) {
                        text.textContent = globalize.translate('VideoToolsDuration', Math.round(duration));
                    }
                    previews.refresh();
                }
            }).catch(() => {
                // Ignore: the start preview still works without a known duration.
            });
        }

        dlg.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();

            const startSeconds = Number(dlg.querySelector('#txtStartTrim').value || 0);
            const endSeconds = Number(dlg.querySelector('#txtEndTrim').value || 0);
            const rotation = Number(dlg.querySelector('#selectRotation').value || 0);

            if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)
                || startSeconds < 0 || endSeconds < 0) {
                toast(globalize.translate('VideoToolsInvalidNumber'));
                return;
            }

            if (duration > 0 && startSeconds + endSeconds >= duration) {
                toast(globalize.translate('VideoToolsTrimTooLong'));
                return;
            }

            dialogHelper.close(dlg);

            startJob(
                apiClient,
                apiClient.getUrl(`VideoTools/${options.itemId}/Cut`, {
                    startSeconds: startSeconds,
                    endSeconds: endSeconds,
                    rotation: rotation
                }),
                globalize.translate('VideoToolsStarted')
            ).then(resolve, (err) => {
                console.error('[videotools] cut failed', err);
                toast(globalize.translate('VideoToolsRequestFailed'));
                resolve();
            });
        });

        dialogHelper.open(dlg).then(() => resolve());
    });
}

export default {
    showTranscode,
    showCut
};
