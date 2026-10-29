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
        const dlg = createDialog(globalize.translate('Transcode'));

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

            startJob(
                apiClient,
                apiClient.getUrl(`VideoTools/${options.itemId}/Transcode`, {
                    codec: codec,
                    bitrateKbps: Math.round(bitrate),
                    resolution: resolution
                }),
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

export function showCut(options) {
    return new Promise((resolve) => {
        const apiClient = ServerConnections.getApiClient(options.serverId);
        const duration = options.durationTicks ? options.durationTicks / 10000000 : 0;
        const dlg = createDialog(globalize.translate('CutVideo'));

        const durationText = duration > 0
            ? globalize.translate('VideoToolsDuration', Math.round(duration))
            : '';

        dlg.innerHTML += globalize.translateHtml(`
            <form class="formDialogContent" style="padding:1.5em 2em;">
                <div class="fieldDescription">${durationText}</div>
                <div class="inputContainer">
                    <label class="inputLabel inputLabelUnfocused" for="txtStartTrim">${globalize.translate('VideoToolsStartTrim')}</label>
                    <input is="emby-input" type="number" id="txtStartTrim" min="0" step="0.1" value="0" />
                </div>
                <div class="inputContainer">
                    <label class="inputLabel inputLabelUnfocused" for="txtEndTrim">${globalize.translate('VideoToolsEndTrim')}</label>
                    <input is="emby-input" type="number" id="txtEndTrim" min="0" step="0.1" value="0" />
                </div>
                <div class="fieldDescription">${globalize.translate('VideoToolsCutHint')}</div>
                <div style="margin-top:2em;">
                    <button is="emby-button" type="button" class="button-cancel block btnCancel" style="background-color:#424242;color:#ffffff;">${globalize.translate('ButtonCancel')}</button>
                    <button is="emby-button" type="submit" class="button-submit block btnStart">${globalize.translate('ButtonStart')}</button>
                </div>
            </form>
        `);

        attachCancel(dlg);

        dlg.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();

            const startSeconds = Number(dlg.querySelector('#txtStartTrim').value || 0);
            const endSeconds = Number(dlg.querySelector('#txtEndTrim').value || 0);

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
                    endSeconds: endSeconds
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
