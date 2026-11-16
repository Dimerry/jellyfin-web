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
        const itemIds = (options.itemIds && options.itemIds.length ? options.itemIds : [options.itemId])
            .filter(id => Boolean(id));
        const isBatch = itemIds.length > 1;

        if (!itemIds.length) {
            // Nothing to transcode: silently opening a dialog for "undefined" only produced a
            // confusing request failure later on.
            toast(globalize.translate('VideoToolsRequestFailed'));
            resolve();
            return;
        }

        const title = isBatch ?
            `${globalize.translate('Transcode')} (${itemIds.length})` :
            globalize.translate('Transcode');
        const dlg = createDialog(title);

        dlg.innerHTML += globalize.translateHtml(`
            <form class="formDialogContent smoothScrollY" style="padding:1.5em 2em;">
                <div class="selectContainer">
                    <label class="selectLabel" for="selectCodec">${globalize.translate('VideoToolsCodec')}</label>
                    <select is="emby-select" id="selectCodec" class="emby-select-withcolor emby-select">
                        <option value="h265" selected>H.265</option>
                        <option value="av1">AV1</option>
                    </select>
                </div>
                <div class="selectContainer">
                    <label class="selectLabel" for="selectEncoder">${globalize.translate('LabelVideoEncoder')}</label>
                    <select is="emby-select" id="selectEncoder" class="emby-select-withcolor emby-select"></select>
                    <div class="fieldDescription">${globalize.translate('LabelEncoderSelectionHelp')}</div>
                </div>
                <div class="selectContainer">
                    <label class="selectLabel" for="selectResolution">${globalize.translate('VideoToolsMaxResolution')}</label>
                    <select is="emby-select" id="selectResolution" class="emby-select-withcolor emby-select">
                        <option value="1080p" selected>1080p</option>
                        <option value="4k">4K (2160p)</option>
                    </select>
                </div>
                <div class="selectContainer">
                    <label class="selectLabel" for="selectRateControl">${globalize.translate('VideoToolsRateControl')}</label>
                    <select is="emby-select" id="selectRateControl" class="emby-select-withcolor emby-select">
                        <option value="quality" selected>${globalize.translate('RateControlQuality')}</option>
                        <option value="bitrate">${globalize.translate('RateControlBitrate')}</option>
                    </select>
                </div>
                <div class="selectContainer" id="qualityContainer">
                    <label class="selectLabel" for="selectQuality">${globalize.translate('LabelQualityLevel')}</label>
                    <select is="emby-select" id="selectQuality" class="emby-select-withcolor emby-select">
                        <option value="highest">${globalize.translate('QualityHighest')}</option>
                        <option value="high">${globalize.translate('QualityHigh')}</option>
                        <option value="medium" selected>${globalize.translate('QualityMedium')}</option>
                        <option value="low">${globalize.translate('QualityLow')}</option>
                        <option value="lowest">${globalize.translate('QualityLowest')}</option>
                    </select>
                </div>
                <div class="inputContainer" id="bitrateContainer" style="display:none;">
                    <label class="inputLabel inputLabelUnfocused" for="txtBitrate">${globalize.translate('VideoToolsBitrate')}</label>
                    <input is="emby-input" type="number" id="txtBitrate" min="100" max="200000" step="100" value="3000" />
                </div>
                <div class="checkboxContainer">
                    <label>
                        <input is="emby-checkbox" type="checkbox" id="chkInterpolate" />
                        <span>${globalize.translate('VideoToolsInterpolate')}</span>
                    </label>
                    <div class="fieldDescription">${globalize.translate('VideoToolsInterpolateHint')}</div>
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

        // The two size controls are mutually exclusive: quality mode hides the bitrate field and
        // bitrate mode hides the quality picker, so the dialog never asks for both.
        const rateControl = dlg.querySelector('#selectRateControl');
        const bitrateContainer = dlg.querySelector('#bitrateContainer');
        const qualityContainer = dlg.querySelector('#qualityContainer');
        rateControl.addEventListener('change', () => {
            const isQuality = rateControl.value === 'quality';
            bitrateContainer.style.display = isQuality ? 'none' : '';
            qualityContainer.style.display = isQuality ? '' : 'none';
        });

        // Encoder choices follow the selected codec, grouping software first and then every
        // hardware encoder. The server walks down this list on failure and always ends on the
        // software encoder, so picking a hardware encoder can never leave the job without output.
        const ENCODER_OPTIONS = {
            h265: [
                { value: 'auto', label: globalize.translate('EncoderAuto') },
                { value: 'libx265', label: 'H.265 (software)' },
                { value: 'hevc_qsv', label: 'H.265 (Intel QSV)' },
                { value: 'hevc_nvenc', label: 'H.265 (NVIDIA NVENC)' },
                { value: 'hevc_vaapi', label: 'H.265 (VA-API)' },
                { value: 'hevc_amf', label: 'H.265 (AMD AMF)' }
            ],
            av1: [
                { value: 'auto', label: globalize.translate('EncoderAuto') },
                { value: 'libsvtav1', label: 'AV1 (software, SVT)' },
                { value: 'av1_qsv', label: 'AV1 (Intel QSV)' },
                { value: 'av1_nvenc', label: 'AV1 (NVIDIA NVENC)' },
                { value: 'av1_vaapi', label: 'AV1 (VA-API)' },
                { value: 'av1_amf', label: 'AV1 (AMD AMF)' }
            ]
        };

        const codecSelect = dlg.querySelector('#selectCodec');
        const encoderSelect = dlg.querySelector('#selectEncoder');
        const fillEncoders = () => {
            const choices = ENCODER_OPTIONS[codecSelect.value] || ENCODER_OPTIONS.h265;
            encoderSelect.innerHTML = choices
                .map(choice => `<option value="${choice.value}"${choice.value === 'auto' ? ' selected' : ''}>${choice.label}</option>`)
                .join('');
        };
        fillEncoders();
        codecSelect.addEventListener('change', fillEncoders);

        // AI interpolation only helps low-frame-rate sources; the server ignores the flag above
        // 23 fps anyway. Fetch the item and only show the option when the source qualifies, so
        // high-frame-rate sources do not offer a checkbox that would silently do nothing.
        const interpolateContainer = dlg.querySelector('#chkInterpolate').closest('.checkboxContainer');
        interpolateContainer.style.display = 'none';
        if (!isBatch && itemIds.length === 1) {
            apiClient.getItem(apiClient.getCurrentUserId(), itemIds[0]).then((item) => {
                const stream = (item?.MediaStreams || []).find((s) => s.Type === 'Video');
                let rate = 0;
                if (stream) {
                    rate = Number(stream.AverageFrameRate || stream.RealFrameRate) || 0;
                }
                if (rate > 0 && rate < 23) {
                    interpolateContainer.style.display = '';
                    const hint = interpolateContainer.querySelector('.fieldDescription');
                    if (hint) {
                        hint.textContent = globalize.translate('VideoToolsInterpolateHint', rate.toFixed(1));
                    }
                }
            }).catch(() => {
                // Without media info the option stays hidden; the server still honors the flag.
            });
        }

        dlg.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();

            const codec = dlg.querySelector('#selectCodec').value;
            const resolution = dlg.querySelector('#selectResolution').value;
            const rateControlMode = dlg.querySelector('#selectRateControl').value;
            const useQuality = rateControlMode === 'quality';
            const qualityPreset = dlg.querySelector('#selectQuality').value;
            const bitrate = Number(dlg.querySelector('#txtBitrate').value);
            const interpolate = dlg.querySelector('#chkInterpolate').checked;

            if (!useQuality && (!Number.isFinite(bitrate) || bitrate < 100 || bitrate > 200000)) {
                toast(globalize.translate('VideoToolsInvalidBitrate'));
                return;
            }

            dialogHelper.close(dlg);

            const params = {
                codec: codec,
                resolution: resolution,
                interpolate: interpolate,
                rateControl: useQuality ? 'quality' : 'bitrate',
                encoder: dlg.querySelector('#selectEncoder').value
            };

            if (useQuality) {
                params.quality = qualityPreset;
            } else {
                params.bitrateKbps = Math.round(bitrate);
            }

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

            // Callers that select items from the multi-select menu only pass itemIds, so
            // options.itemId is undefined there and produced a "VideoTools/undefined/Transcode"
            // request. Use the resolved list for the single-item case too.
            startJob(
                apiClient,
                apiClient.getUrl(`VideoTools/${itemIds[0]}/Transcode`, params),
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
 * Formats a duration in seconds as hours/minutes/seconds, dropping leading zero units.
 * 4530 -> "1小时15分30秒", 90 -> "1分30秒", 12 -> "12秒".
 */
function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0) {
        return globalize.translate('VideoToolsDurationHms', hours, minutes, secs);
    }

    if (minutes > 0) {
        return globalize.translate('VideoToolsDurationMs', minutes, secs);
    }

    return globalize.translate('VideoToolsDurationS', secs);
}

/**
 * Wires the two cut previews: the first kept frame (start trim) and the last kept frame (end trim).
 * A preview stays hidden while its trim value is 0.
 */
function setupCutPreviews(options) {
    const { dlg, apiClient, itemId, getDuration, getStart, getEnd, trimInputs } = options;
    const rotationSelect = dlg.querySelector('#selectRotation');
    const boxes = {
        front: dlg.querySelector('#cutPreviewFront'),
        back: dlg.querySelector('#cutPreviewBack')
    };
    const tokens = { front: 0, back: 0 };
    const timers = { front: null, back: null };
    const container = dlg.querySelector('#cutPreviews');

    // The container always lays out two equal columns, so a single preview keeps
    // the same size as when both are visible; a lone preview is left-aligned.
    function syncLayout() {
        const frontShown = boxes.front.style.display !== 'none';
        const backShown = boxes.back.style.display !== 'none';

        boxes.front.style.gridColumn = frontShown && !backShown ? '1' : '';
        boxes.back.style.gridColumn = backShown && !frontShown ? '1' : '';
        container.style.display = frontShown || backShown ? 'grid' : 'none';
    }

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
        syncLayout();
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
        syncLayout();
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
        const start = getStart();
        const end = getEnd();
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

    trimInputs.forEach((input) => {
        input.addEventListener('input', refresh);
    });
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

/**
 * Wires the cut crop preview. The frame is always rendered uncropped at source aspect ratio, then
 * a blue frame marks the part that survives and two dark panels shade the parts that are cut away.
 * Percentages (not pixels) are used for both the overlay and the ffmpeg crop, so the blue frame
 * matches the output even though the preview is scaled down. With no crop value on either side,
 * the whole preview block is hidden.
 */
function setupCropPreview(options) {
    const { dlg, apiClient, itemId, getCrop } = options;
    const box = dlg.querySelector('#cutCropPreview');
    const img = box.querySelector('img');
    const status = box.querySelector('.cutCropStatus');
    const frame = box.querySelector('.cutCropFrame');
    const leftShade = box.querySelector('.cutCropShadeLeft');
    const rightShade = box.querySelector('.cutCropShadeRight');
    const keptLabel = dlg.querySelector('#cutCropKept');
    const rotationSelect = dlg.querySelector('#selectRotation');
    const token = { value: 0 };

    const clampPercent = (value) => {
        if (!Number.isFinite(value) || value <= 0) {
            return 0;
        }

        return Math.min(99, value);
    };

    const readCrop = () => {
        const raw = getCrop();
        const left = clampPercent(raw.left);
        const right = clampPercent(raw.right);
        const sum = left + right;
        return {
            left,
            right,
            // Two sides can each be legal but together exceed 100%; shrink them proportionally so
            // the blue frame never collapses into nothing while the user is still typing.
            leftFinal: sum > 99 ? Math.round((left * 99 / sum) * 100) / 100 : left,
            rightFinal: sum > 99 ? Math.round((right * 99 / sum) * 100) / 100 : right,
            kept: Math.max(0, 100 - Math.min(99, sum))
        };
    };

    const syncFrame = () => {
        const crop = readCrop();
        frame.style.left = `${crop.leftFinal}%`;
        frame.style.right = `${crop.rightFinal}%`;
        leftShade.style.width = `${crop.leftFinal}%`;
        rightShade.style.width = `${crop.rightFinal}%`;
        if (keptLabel) {
            keptLabel.textContent = globalize.translate('VideoToolsCropLeftKept', `${parseFloat(crop.kept.toFixed(1))}`);
        }
    };

    const load = () => {
        const current = ++token.value;
        const time = options.getPreviewTime ? options.getPreviewTime() : 1;
        status.textContent = globalize.translate('VideoToolsPreviewLoading');
        status.style.display = '';
        img.style.visibility = 'hidden';

        // Uncropped frame: the blue frame is drawn over it, so the shaded areas stay visible.
        const url = apiClient.getUrl(`VideoTools/${itemId}/Frame`, {
            timeSeconds: Number(time || 0).toFixed(3),
            maxWidth: 640,
            rotation: Number(rotationSelect.value || 0),
            ApiKey: apiClient.accessToken()
        });

        img.onload = () => {
            if (current !== token.value) return;
            status.style.display = 'none';
            img.style.visibility = '';
        };
        img.onerror = () => {
            if (current !== token.value) return;
            status.textContent = globalize.translate('VideoToolsPreviewFailed');
            status.style.display = '';
            img.style.visibility = 'hidden';
        };
        img.src = url;
    };

    // No numeric crop on either side: keep the whole preview block out of the layout.
    const syncVisibility = () => {
        const crop = readCrop();
        const visible = crop.left > 0 || crop.right > 0;
        box.style.display = visible ? '' : 'none';
        return visible;
    };

    // `shown` tracks whether the preview is on screen with a current frame, so re-showing it
    // after both sides were cleared fetches a fresh frame instead of reusing a stale one.
    let shown = false;
    const applyPreview = (reloadFrame) => {
        const visible = syncVisibility();
        syncFrame();
        if (visible && (reloadFrame || !shown)) {
            load();
        }
        shown = visible;
    };

    applyPreview(false);

    return {
        refresh: () => applyPreview(false),
        refreshFrame: () => applyPreview(true)
    };
}

export function showCut(options) {
    return new Promise((resolve) => {
        const apiClient = ServerConnections.getApiClient(options.serverId);
        let duration = options.durationTicks ? options.durationTicks / 10000000 : 0;
        const dlg = createDialog(globalize.translate('CutVideo'));

        const durationText = duration > 0 ?
            globalize.translate('VideoToolsDuration', formatDuration(duration)) :
            '';

        dlg.innerHTML += globalize.translateHtml(`
            <form class="formDialogContent smoothScrollY" style="padding:1.5em 2em 3em;">
                <div class="fieldDescription" id="cutDurationText">${durationText}</div>
                <div class="inputContainer">
                    <label class="inputLabel inputLabelUnfocused" for="txtStartMin">${globalize.translate('VideoToolsStartTrim')}</label>
                    <div style="display:flex;flex-wrap:nowrap;align-items:center;gap:.35em;white-space:nowrap;margin-top:.25em;">
                        <input type="number" class="emby-input" id="txtStartMin" min="0" step="1" value="0" style="width:5em;flex:0 0 5em;min-width:0;" />
                        <span style="flex:0 0 auto;margin-right:.7em;color:#aaa;white-space:nowrap;">${globalize.translate('VideoToolsMinutes')}</span>
                        <input type="number" class="emby-input" id="txtStartSec" min="0" max="59.9" step="0.1" value="0" style="width:5em;flex:0 0 5em;min-width:0;" />
                        <span style="flex:0 0 auto;color:#aaa;white-space:nowrap;">${globalize.translate('VideoToolsSeconds')}</span>
                    </div>
                </div>
                <div class="inputContainer">
                    <label class="inputLabel inputLabelUnfocused" for="txtEndMin">${globalize.translate('VideoToolsEndTrim')}</label>
                    <div style="display:flex;flex-wrap:nowrap;align-items:center;gap:.35em;white-space:nowrap;margin-top:.25em;">
                        <input type="number" class="emby-input" id="txtEndMin" min="0" step="1" value="0" style="width:5em;flex:0 0 5em;min-width:0;" />
                        <span style="flex:0 0 auto;margin-right:.7em;color:#aaa;white-space:nowrap;">${globalize.translate('VideoToolsMinutes')}</span>
                        <input type="number" class="emby-input" id="txtEndSec" min="0" max="59.9" step="0.1" value="0" style="width:5em;flex:0 0 5em;min-width:0;" />
                        <span style="flex:0 0 auto;color:#aaa;white-space:nowrap;">${globalize.translate('VideoToolsSeconds')}</span>
                    </div>
                </div>
                <div id="cutPreviews" style="display:none;grid-template-columns:1fr 1fr;gap:.75em;margin:.25em 0 .75em;">
                    <div id="cutPreviewFront" style="display:none;min-width:0;">
                        <div class="fieldDescription" style="margin:0 0 .3em;">${globalize.translate('VideoToolsPreviewFront')}</div>
                        <div style="position:relative;background:#000;border-radius:4px;overflow:hidden;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                            <img alt="" style="max-width:100%;max-height:100%;display:block;" />
                            <div class="cutPreviewStatus" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cfcfcf;font-size:.8em;background:rgba(0,0,0,.35);"></div>
                        </div>
                        <div class="cutPreviewTime fieldDescription" style="margin:.2em 0 0;"></div>
                    </div>
                    <div id="cutPreviewBack" style="display:none;min-width:0;">
                        <div class="fieldDescription" style="margin:0 0 .3em;">${globalize.translate('VideoToolsPreviewBack')}</div>
                        <div style="position:relative;background:#000;border-radius:4px;overflow:hidden;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                            <img alt="" style="max-width:100%;max-height:100%;display:block;" />
                            <div class="cutPreviewStatus" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cfcfcf;font-size:.8em;background:rgba(0,0,0,.35);"></div>
                        </div>
                        <div class="cutPreviewTime fieldDescription" style="margin:.2em 0 0;"></div>
                    </div>
                </div>
                <div class="inputContainer" style="display:flex;gap:1em;align-items:flex-start;">
                    <div style="flex:1 1 0;min-width:0;">
                        <label class="inputLabel inputLabelUnfocused" for="txtCropLeft">${globalize.translate('VideoToolsCropLeft')}</label>
                        <div style="display:flex;flex-wrap:nowrap;align-items:center;gap:.5em;white-space:nowrap;margin-top:.25em;">
                            <input type="number" class="emby-input" id="txtCropLeft" min="0" max="99" step="0.5" value="0" style="width:5.5em;flex:0 0 5.5em;min-width:0;" />
                        </div>
                    </div>
                    <div style="flex:1 1 0;min-width:0;">
                        <label class="inputLabel inputLabelUnfocused" for="txtCropRight">${globalize.translate('VideoToolsCropRight')}</label>
                        <div style="display:flex;flex-wrap:nowrap;align-items:center;gap:.5em;white-space:nowrap;margin-top:.25em;">
                            <input type="number" class="emby-input" id="txtCropRight" min="0" max="99" step="0.5" value="0" style="width:5.5em;flex:0 0 5.5em;min-width:0;" />
                        </div>
                    </div>
                </div>
                <div id="cutCropPreview" style="display:none;margin:.25em 0 .75em;">
                    <div class="fieldDescription" style="margin:0 0 .3em;">
                        ${globalize.translate('VideoToolsCropPreview')}
                        <span id="cutCropKept" style="margin-left:.5em;color:#4a9eff;"></span>
                    </div>
                    <div style="position:relative;width:340px;max-width:100%;margin:0 auto;background:#000;border-radius:4px;overflow:hidden;" id="cutCropStage">
                        <img alt="" style="width:100%;height:auto;display:block;visibility:hidden;" />
                        <div class="cutCropShadeLeft" style="position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(0,0,0,.66);pointer-events:none;"></div>
                        <div class="cutCropShadeRight" style="position:absolute;right:0;top:0;bottom:0;width:0;background:rgba(0,0,0,.66);pointer-events:none;"></div>
                        <div class="cutCropFrame" style="position:absolute;top:0;bottom:0;left:0;right:0;border:2px solid #2f9bff;box-sizing:border-box;pointer-events:none;"></div>
                        <div class="cutCropStatus" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cfcfcf;font-size:.8em;background:rgba(0,0,0,.35);"></div>
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
                <div class="fieldDescription">${globalize.translate('VideoToolsCropHint')}</div>
                <div style="margin-top:2em;">
                    <button is="emby-button" type="button" class="button-cancel block btnCancel" style="background-color:#424242;color:#ffffff;">${globalize.translate('ButtonCancel')}</button>
                    <button is="emby-button" type="submit" class="button-submit block btnStart">${globalize.translate('ButtonStart')}</button>
                </div>
            </form>
        `);

        attachCancel(dlg);

        const trimInputs = [
            dlg.querySelector('#txtStartMin'),
            dlg.querySelector('#txtStartSec'),
            dlg.querySelector('#txtEndMin'),
            dlg.querySelector('#txtEndSec')
        ];

        const readTrim = (minId, secId) => {
            const minutes = Number(dlg.querySelector(minId).value || 0);
            const seconds = Number(dlg.querySelector(secId).value || 0);
            const m = Number.isFinite(minutes) ? minutes : 0;
            const s = Number.isFinite(seconds) ? seconds : 0;
            return (m * 60) + s;
        };

        const getStart = () => readTrim('#txtStartMin', '#txtStartSec');
        const getEnd = () => readTrim('#txtEndMin', '#txtEndSec');

        const readCropSide = (id) => {
            const raw = dlg.querySelector(id).value;
            const value = raw === '' ? 0 : Number(raw);
            return Number.isFinite(value) && value > 0 ? value : 0;
        };
        const getCrop = () => ({
            left: readCropSide('#txtCropLeft'),
            right: readCropSide('#txtCropRight')
        });

        const cropPreview = setupCropPreview({
            dlg: dlg,
            apiClient: apiClient,
            itemId: options.itemId,
            getCrop: getCrop,
            // A frame from the first kept second: the crop is the same over the whole clip.
            getPreviewTime: () => Math.max(0, getStart() + 0.5)
        });

        ['#txtCropLeft', '#txtCropRight'].forEach((id) => {
            dlg.querySelector(id).addEventListener('input', () => cropPreview.refresh());
        });
        dlg.querySelector('#selectRotation').addEventListener('change', () => cropPreview.refreshFrame());
        trimInputs.forEach((input) => {
            input.addEventListener('change', () => cropPreview.refreshFrame());
        });

        const previews = setupCutPreviews({
            dlg: dlg,
            apiClient: apiClient,
            itemId: options.itemId,
            getDuration: () => duration,
            getStart: getStart,
            getEnd: getEnd,
            trimInputs: trimInputs
        });

        if (!Number.isFinite(duration) || duration <= 0) {
            // The end preview needs the duration; fetch it when the caller did not provide it.
            apiClient.getItem(apiClient.getCurrentUserId(), options.itemId).then((item) => {
                if (item && item.RunTimeTicks) {
                    duration = item.RunTimeTicks / 10000000;
                    const text = dlg.querySelector('#cutDurationText');
                    if (text) {
                        text.textContent = globalize.translate('VideoToolsDuration', formatDuration(duration));
                    }
                    previews.refresh();
                }
            }).catch(() => {
                // Ignore: the start preview still works without a known duration.
            });
        }

        dlg.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();

            const startSeconds = getStart();
            const endSeconds = getEnd();
            const rotation = Number(dlg.querySelector('#selectRotation').value || 0);
            const crop = getCrop();

            if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)
                || startSeconds < 0 || endSeconds < 0) {
                toast(globalize.translate('VideoToolsInvalidNumber'));
                return;
            }

            if (!Number.isFinite(crop.left) || !Number.isFinite(crop.right)
                || crop.left >= 100 || crop.right >= 100 || crop.left + crop.right >= 100) {
                toast(globalize.translate('VideoToolsCropInvalid'));
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
                    rotation: rotation,
                    cropLeft: crop.left,
                    cropRight: crop.right
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
