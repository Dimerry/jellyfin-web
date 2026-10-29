import dialogHelper from '../dialogHelper/dialogHelper';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import toast from '../toast/toast';
import '../../elements/emby-input/emby-input';
import '../../elements/emby-button/emby-button';
import '../formdialog.scss';

// Dark grey for the neutral actions, accent blue for the destructive "overwrite" one.
const DARK_BUTTON = 'background-color:#424242;color:#ffffff;';
const BLUE_BUTTON = 'background-color:#2196f3;color:#ffffff;';

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
        <div class="renameBody"></div>
    `);

    return dlg;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getRenameInfo(apiClient, itemId) {
    return apiClient.getJSON(apiClient.getUrl(`VideoTools/${itemId}/RenameInfo`));
}

function requestRename(apiClient, itemId, newName, onConflict) {
    return apiClient.ajax({
        type: 'POST',
        url: apiClient.getUrl(`VideoTools/${itemId}/Rename`, {
            newName: newName,
            onConflict: onConflict
        }),
        dataType: 'json'
    });
}

export function showRename(options) {
    const apiClient = ServerConnections.getApiClient(options.serverId);

    return getRenameInfo(apiClient, options.itemId).then((info) => new Promise((resolve) => {
        const dlg = createDialog(globalize.translate('ButtonRename'));
        const body = dlg.querySelector('.renameBody');
        let settled = false;

        const closeWith = (value) => {
            if (settled) {
                return;
            }

            settled = true;
            resolve(value);
            dialogHelper.close(dlg);
        };

        // Resolve even when the dialog is dismissed with the back button or a hash change.
        dlg.addEventListener('close', () => {
            if (!settled) {
                settled = true;
                resolve(false);
            }
        });

        const attachCancelButtons = () => {
            dlg.querySelectorAll('.btnCancel, .btnRenameCancel').forEach((btn) => {
                btn.addEventListener('click', () => closeWith(false));
            });
        };

        const submit = (newName, onConflict) => {
            const trimmed = newName.trim();
            if (!trimmed) {
                toast(globalize.translate('VideoToolsRenameInvalidName'));
                return;
            }

            requestRename(apiClient, options.itemId, trimmed, onConflict).then((result) => {
                if (result?.Conflict) {
                    renderConflictStep(trimmed);
                    return;
                }

                if (result?.Success) {
                    toast(globalize.translate('VideoToolsRenameSuccess', result.NewName));
                    closeWith(true);
                    return;
                }

                toast(globalize.translate('VideoToolsRenameFailed', result?.Error || ''));
            }, (err) => {
                console.error('[rename] request failed', err);
                toast(globalize.translate('VideoToolsRenameFailed', err?.message || ''));
            });
        };

        const renderConflictStep = (newName) => {
            body.innerHTML = globalize.translateHtml(`
                <div class="formDialogContent" style="padding:1.5em 2em;">
                    <div class="fieldDescription" style="margin-bottom:1em;">${globalize.translate('VideoToolsRenameConflict', escapeHtml(newName))}</div>
                    <button is="emby-button" type="button" class="block btnKeepBoth" style="${DARK_BUTTON}">${globalize.translate('VideoToolsRenameKeepBoth')}</button>
                    <button is="emby-button" type="button" class="block btnOverwrite" style="${BLUE_BUTTON}">${globalize.translate('VideoToolsRenameOverwrite')}</button>
                    <button is="emby-button" type="button" class="block btnRenameCancel" style="${DARK_BUTTON}">${globalize.translate('ButtonCancel')}</button>
                </div>
            `);

            body.querySelector('.btnKeepBoth').addEventListener('click', () => submit(newName, 'keepBoth'));
            body.querySelector('.btnOverwrite').addEventListener('click', () => submit(newName, 'overwrite'));
            body.querySelector('.btnRenameCancel').addEventListener('click', () => closeWith(false));
        };

        const renderNameStep = (currentName) => {
            const label = info.IsFolder ? globalize.translate('VideoToolsFolderName') : globalize.translate('VideoToolsFileName');
            const hint = info.IsFolder ? globalize.translate('VideoToolsRenameFolderHint') : globalize.translate('VideoToolsRenameFileHint');

            body.innerHTML = globalize.translateHtml(`
                <form class="formDialogContent" style="padding:1.5em 2em;">
                    <div class="inputContainer">
                        <label class="inputLabel inputLabelUnfocused" for="txtRename">${label}</label>
                        <input is="emby-input" type="text" id="txtRename" value="${escapeHtml(currentName)}" />
                    </div>
                    <div class="fieldDescription">${hint}</div>
                    <div style="margin-top:2em;">
                        <button is="emby-button" type="button" class="block btnRenameCancel" style="${DARK_BUTTON}">${globalize.translate('ButtonCancel')}</button>
                        <button is="emby-button" type="submit" class="button-submit block">${globalize.translate('ButtonRename')}</button>
                    </div>
                </form>
            `);

            const input = body.querySelector('#txtRename');
            const form = body.querySelector('form');

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                submit(input.value, 'ask');
            });

            attachCancelButtons();

            requestAnimationFrame(() => {
                input.focus();
                const dot = input.value.lastIndexOf('.');
                if (!info.IsFolder && dot > 0) {
                    input.setSelectionRange(0, dot);
                } else {
                    input.select();
                }
            });
        };

        renderNameStep(info.Name || '');

        dialogHelper.open(dlg);
    }), (err) => {
        console.error('[rename] could not load item name', err);
        toast(globalize.translate('VideoToolsRenameFailed', err?.message || ''));
    });
}

export default {
    showRename
};
