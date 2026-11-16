import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Close from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

import Page from 'components/Page';
import toast from 'components/toast/toast';
import { useApi } from 'hooks/useApi';
import globalize from 'lib/globalize';

type VideoToolJob = {
    Id: string;
    Kind: 'Transcode' | 'Cut';
    ItemName: string;
    Status: 'Queued' | 'Running' | 'Completed' | 'Failed' | 'Canceled';
    Progress?: number | null;
    QueuePosition?: number | null;
    Codec?: string | null;
    Resolution?: string | null;
    BitrateKbps?: number | null;
    UseQuality?: boolean;
    Quality?: string | null;
    Encoder?: string | null;
    EncoderKind?: 'Hardware' | 'Software' | null;
    FallbackFrom?: string | null;
    OutputPath: string;
    Error?: string | null;
    CreatedAt: string;
};

type VideoToolsTranscodeDefaults = {
    Codec: string;
    Encoder: string;
    Resolution: string;
    RateControl: string;
    Quality: string;
    BitrateKbps: number;
};

type VideoToolsCutDefaults = {
    Codec: string;
    Encoder: string;
    RateControl: string;
    Quality: string;
    BitrateKbps: number;
};

type VideoToolsDefaults = {
    Transcode: VideoToolsTranscodeDefaults;
    Cut: VideoToolsCutDefaults;
};

/** Encoder choices, matching the transcode dialog so both surfaces offer the same options. */
const ENCODER_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
    h265: [
        { value: 'auto', label: 'Auto' },
        { value: 'libx265', label: 'H.265 (software)' },
        { value: 'hevc_qsv', label: 'H.265 (Intel QSV)' },
        { value: 'hevc_nvenc', label: 'H.265 (NVIDIA NVENC)' },
        { value: 'hevc_vaapi', label: 'H.265 (VA-API)' },
        { value: 'hevc_amf', label: 'H.265 (AMD AMF)' }
    ],
    av1: [
        { value: 'auto', label: 'Auto' },
        { value: 'libsvtav1', label: 'AV1 (software, SVT)' },
        { value: 'av1_qsv', label: 'AV1 (Intel QSV)' },
        { value: 'av1_nvenc', label: 'AV1 (NVIDIA NVENC)' },
        { value: 'av1_vaapi', label: 'AV1 (VA-API)' },
        { value: 'av1_amf', label: 'AV1 (AMD AMF)' }
    ]
};

const QUALITY_VALUES = [ 'highest', 'high', 'medium', 'low', 'lowest' ];

const ACTIVE_STATUSES = new Set(['Queued', 'Running']);

const getStatusLabel = (status: VideoToolJob['Status']) => {
    switch (status) {
        case 'Queued':
            return globalize.translate('VideoToolsStatusQueued');
        case 'Running':
            return globalize.translate('VideoToolsStatusRunning');
        case 'Completed':
            return globalize.translate('VideoToolsStatusCompleted');
        case 'Failed':
            return globalize.translate('VideoToolsStatusFailed');
        case 'Canceled':
            return globalize.translate('VideoToolsStatusCanceled');
        default:
            return status;
    }
};

const getStatusColor = (status: VideoToolJob['Status']): 'default' | 'primary' | 'success' | 'error' | 'warning' => {
    switch (status) {
        case 'Running':
            return 'primary';
        case 'Completed':
            return 'success';
        case 'Failed':
            return 'error';
        case 'Canceled':
            return 'warning';
        default:
            return 'default';
    }
};

const getFormatLabel = (job: VideoToolJob) => {
    if (job.Kind === 'Cut') {
        return globalize.translate('CutVideo');
    }

    // Quality-mode jobs carry the preset instead of a bitrate: the encoder picks the rate itself,
    // so a kbps figure would be meaningless.
    if (job.UseQuality) {
        const qualityKey = `Quality${(job.Quality || 'medium').charAt(0).toUpperCase()}${(job.Quality || 'medium').slice(1)}`;
        return [job.Codec, job.Resolution, globalize.translate(qualityKey)]
            .filter(Boolean)
            .join(' · ');
    }

    return [job.Codec, job.Resolution, job.BitrateKbps ? `${job.BitrateKbps} kbps` : null]
        .filter(Boolean)
        .join(' · ');
};

const getEncoderNote = (job: VideoToolJob) => {
    if (!job.Encoder || job.Kind === 'Cut') {
        return null;
    }

    if (job.EncoderKind === 'Hardware') {
        return globalize.translate('VideoToolsEncoderHardware', job.Encoder);
    }

    return job.FallbackFrom ?
        globalize.translate('VideoToolsEncoderFallback', job.Encoder) :
        globalize.translate('VideoToolsEncoderSoftware', job.Encoder);
};

type JobTableProps = {
    jobs: VideoToolJob[],
    showQueuePosition: boolean,
    onRetry?: (job: VideoToolJob) => void,
    retryingId?: string | null,
    onCancel?: (job: VideoToolJob) => void,
    cancelingId?: string | null,
    onPlay?: (job: VideoToolJob) => void
};

const JobProgress = ({ job }: { job: VideoToolJob }) => {
    if (job.Status === 'Running' && job.Progress != null) {
        return (
            <Stack direction='row' spacing={1} alignItems='center'>
                <LinearProgress
                    variant='determinate'
                    value={job.Progress}
                    sx={{ flexGrow: 1 }}
                />
                <Typography variant='caption'>{Math.round(job.Progress)}%</Typography>
            </Stack>
        );
    }

    if (job.Status === 'Failed') {
        return (
            <Typography variant='caption' color='error'>
                {(job.Error || '').slice(-160)}
            </Typography>
        );
    }

    return (
        <Typography variant='caption' color='text.secondary'>
            {job.Status === 'Completed' ? '100%' : '—'}
        </Typography>
    );
};

const JobRow = ({ job, showQueuePosition, onRetry, retryingId, onCancel, cancelingId, onPlay }: JobTableProps & { job: VideoToolJob }) => {
    const isCompleted = job.Status === 'Completed';
    const canPlay = isCompleted && Boolean(onPlay);
    const isActive = job.Status === 'Queued' || job.Status === 'Running';

    return (
        <TableRow
            hover={canPlay}
            onClick={canPlay ? () => onPlay?.(job) : undefined}
            title={canPlay ? globalize.translate('VideoToolsPlayOutput') : undefined}
            sx={{ cursor: canPlay ? 'pointer' : 'default' }}
        >
            <TableCell>{job.ItemName}</TableCell>
            <TableCell>{getFormatLabel(job)}</TableCell>
            <TableCell>
                <Chip
                    size='small'
                    color={getStatusColor(job.Status)}
                    label={getStatusLabel(job.Status)}
                />
                {getEncoderNote(job) && (
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
                        {getEncoderNote(job)}
                    </Typography>
                )}
                {showQueuePosition && job.QueuePosition != null && (
                    <Typography component='span' variant='caption' sx={{ ml: 1 }}>
                        #{job.QueuePosition}
                    </Typography>
                )}
                {job.Status === 'Failed' && onRetry && (
                    <Button
                        size='small'
                        onClick={(e) => {
                            e.stopPropagation();
                            onRetry(job);
                        }}
                        disabled={retryingId === job.Id}
                        sx={{ ml: 1 }}
                    >
                        {globalize.translate('Retry')}
                    </Button>
                )}
                {isActive && onCancel && (
                    <Button
                        size='small'
                        color='warning'
                        onClick={(e) => {
                            e.stopPropagation();
                            onCancel(job);
                        }}
                        disabled={cancelingId === job.Id}
                        sx={{ ml: 1 }}
                    >
                        {globalize.translate('ButtonCancel')}
                    </Button>
                )}
                {isCompleted && onPlay && (
                    <Button
                        size='small'
                        onClick={(e) => {
                            e.stopPropagation();
                            onPlay(job);
                        }}
                        sx={{ ml: 1 }}
                    >
                        {globalize.translate('Play')}
                    </Button>
                )}
            </TableCell>
            <TableCell>
                <JobProgress job={job} />
            </TableCell>
        </TableRow>
    );
};

const JobTable = (props: JobTableProps) => (
    <TableContainer component={Paper} variant='outlined'>
        <Table size='small'>
            <TableHead>
                <TableRow>
                    <TableCell>{globalize.translate('VideoToolsColumnItem')}</TableCell>
                    <TableCell>{globalize.translate('VideoToolsColumnFormat')}</TableCell>
                    <TableCell>{globalize.translate('LabelStatus')}</TableCell>
                    <TableCell width='30%'>{globalize.translate('VideoToolsColumnProgress')}</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {props.jobs.map((job) => (
                    <JobRow key={job.Id} job={job} {...props} />
                ))}
            </TableBody>
        </Table>
    </TableContainer>
);

type DefaultsDialogProps = {
    kind: 'transcode' | 'cut';
    defaults: VideoToolsDefaults | null;
    onClose: () => void;
    onSaved: (defaults: VideoToolsDefaults) => void;
    apiClient: NonNullable<ReturnType<typeof useApi>['__legacyApiClient__']>;
};

const DefaultsDialog = ({ kind, defaults, onClose, onSaved, apiClient }: DefaultsDialogProps) => {
    const isCut = kind === 'cut';
    const source = isCut ? defaults?.Cut : defaults?.Transcode;
    const [ draft, setDraft ] = useState(() => ({ ...source }));
    const [ isSaving, setIsSaving ] = useState(false);

    // Defaults stored before the cut codec existed lack the field; seed it so the select binds.
    useEffect(() => {
        if (isCut && draft && !(draft as VideoToolsCutDefaults).Codec) {
            setDraft((current) => ({ ...current, Codec: 'h265' }));
        }
    }, [ isCut, draft ]);

    const update = (key: string, value: string | number) => {
        setDraft((current) => ({ ...current, [key]: value }));
    };

    const selectedCodec = (draft as VideoToolsTranscodeDefaults)?.Codec;
    const cutCodec = isCut ? ((draft as VideoToolsCutDefaults)?.Codec ?? 'h265') : selectedCodec;
    const codecKey = cutCodec === 'av1' ? 'av1' : 'h265';
    const encoderOptions = ENCODER_OPTIONS[codecKey] ?? ENCODER_OPTIONS.h265;
    const isQuality = draft?.RateControl === 'quality';

    const handleSave = async () => {
        if (!defaults) {
            return;
        }

        const next: VideoToolsDefaults = {
            Transcode: defaults.Transcode,
            Cut: defaults.Cut
        };

        if (isCut) {
            next.Cut = draft as VideoToolsCutDefaults;
        } else {
            next.Transcode = draft as VideoToolsTranscodeDefaults;
        }

        setIsSaving(true);
        try {
            const saved = await apiClient.ajax({
                type: 'POST',
                url: apiClient.getUrl('VideoTools/Defaults'),
                data: JSON.stringify(next),
                contentType: 'application/json',
                dataType: 'json'
            }) as VideoToolsDefaults;
            onSaved(saved);
            toast(globalize.translate('VideoToolsDefaultsSaved'));
            onClose();
        } catch (err) {
            console.error('[videotools] failed to save defaults', err);
            toast(globalize.translate('VideoToolsRequestFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    if (!draft) {
        return null;
    }

    return (
        <Dialog open onClose={onClose} maxWidth='sm' fullWidth>
            <DialogTitle>
                {globalize.translate(isCut ? 'VideoToolsDefaultCutConfig' : 'VideoToolsDefaultTranscodeConfig')}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} mt={1}>
                    {!isCut && (
                        <TextField
                            select
                            label={globalize.translate('VideoToolsCodec')}
                            value={(draft as VideoToolsTranscodeDefaults).Codec}
                            onChange={(e) => update('Codec', e.target.value)}
                        >
                            <MenuItem value='h265'>H.265</MenuItem>
                            <MenuItem value='av1'>AV1</MenuItem>
                        </TextField>
                    )}

                    {isCut && (
                        <TextField
                            select
                            label={globalize.translate('VideoToolsCodec')}
                            value={(draft as VideoToolsCutDefaults).Codec ?? 'h265'}
                            onChange={(e) => update('Codec', e.target.value)}
                        >
                            <MenuItem value='h265'>H.265</MenuItem>
                            <MenuItem value='av1'>AV1</MenuItem>
                        </TextField>
                    )}

                    <TextField
                        select
                        label={globalize.translate('LabelVideoEncoder')}
                        value={draft.Encoder}
                        onChange={(e) => update('Encoder', e.target.value)}
                    >
                        {encoderOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>

                    {!isCut && (
                        <TextField
                            select
                            label={globalize.translate('VideoToolsMaxResolution')}
                            value={(draft as VideoToolsTranscodeDefaults).Resolution}
                            onChange={(e) => update('Resolution', e.target.value)}
                        >
                            <MenuItem value='1080p'>1080p</MenuItem>
                            <MenuItem value='4k'>4K (2160p)</MenuItem>
                        </TextField>
                    )}

                    <TextField
                        select
                        label={globalize.translate('VideoToolsRateControl')}
                        value={draft.RateControl}
                        onChange={(e) => update('RateControl', e.target.value)}
                    >
                        <MenuItem value='quality'>{globalize.translate('RateControlQuality')}</MenuItem>
                        <MenuItem value='bitrate'>{globalize.translate('RateControlBitrate')}</MenuItem>
                    </TextField>

                    {isQuality ? (
                        <TextField
                            select
                            label={globalize.translate('LabelQualityLevel')}
                            value={draft.Quality}
                            onChange={(e) => update('Quality', e.target.value)}
                        >
                            {QUALITY_VALUES.map((value) => (
                                <MenuItem key={value} value={value}>
                                    {globalize.translate(`Quality${value.charAt(0).toUpperCase()}${value.slice(1)}`)}
                                </MenuItem>
                            ))}
                        </TextField>
                    ) : (
                        <TextField
                            type='number'
                            label={globalize.translate('VideoToolsBitrate')}
                            value={draft.BitrateKbps}
                            onChange={(e) => update('BitrateKbps', Number(e.target.value))}
                        />
                    )}

                    {isCut && (
                        <Typography variant='body2' color='text.secondary'>
                            {globalize.translate('VideoToolsCutDefaultsHint')}
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{globalize.translate('ButtonCancel')}</Button>
                <Button variant='contained' onClick={handleSave} disabled={isSaving}>
                    {globalize.translate('Save')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export const Component = () => {
    const { __legacyApiClient__ } = useApi();
    const [ jobs, setJobs ] = useState<VideoToolJob[]>([]);
    const [ isLoading, setIsLoading ] = useState(true);
    const [ isClearing, setIsClearing ] = useState(false);
    const [ retryingId, setRetryingId ] = useState<string | null>(null);
    const [ cancelingId, setCancelingId ] = useState<string | null>(null);
    const [ playingJob, setPlayingJob ] = useState<VideoToolJob | null>(null);
    const [ defaults, setDefaults ] = useState<VideoToolsDefaults | null>(null);
    const [ configKind, setConfigKind ] = useState<'transcode' | 'cut' | null>(null);

    const loadJobs = useCallback(async () => {
        if (!__legacyApiClient__) {
            return;
        }

        try {
            const result = await __legacyApiClient__.getJSON(
                __legacyApiClient__.getUrl('VideoTools/Jobs')
            ) as VideoToolJob[];
            setJobs(result);
            setIsLoading(false);
        } catch (err) {
            console.error('[transcodequeue] failed to load jobs', err);
            setIsLoading(false);
        }
    }, [ __legacyApiClient__ ]);

    const loadDefaults = useCallback(async () => {
        if (!__legacyApiClient__) {
            return;
        }

        try {
            const result = await __legacyApiClient__.getJSON(
                __legacyApiClient__.getUrl('VideoTools/Defaults')
            ) as VideoToolsDefaults;
            setDefaults(result);
        } catch (err) {
            console.error('[videotools] failed to load defaults', err);
        }
    }, [ __legacyApiClient__ ]);

    useEffect(() => {
        void loadDefaults();
    }, [ loadDefaults ]);

    useEffect(() => {
        if (!__legacyApiClient__) {
            return;
        }

        void loadJobs();
        const timer = window.setInterval(loadJobs, 2000);

        return () => {
            window.clearInterval(timer);
        };
    }, [ __legacyApiClient__, loadJobs ]);

    const activeJobs = useMemo(
        () => jobs
            .filter((job) => ACTIVE_STATUSES.has(job.Status))
            .sort((a, b) => {
                if (a.Status === 'Running' && b.Status !== 'Running') return -1;
                if (b.Status === 'Running' && a.Status !== 'Running') return 1;
                return (a.QueuePosition ?? 0) - (b.QueuePosition ?? 0);
            }),
        [ jobs ]
    );

    const recentJobs = useMemo(
        () => jobs
            .filter((job) => !ACTIVE_STATUSES.has(job.Status))
            .sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime())
            .slice(0, 20),
        [ jobs ]
    );

    const finishedCount = useMemo(
        () => jobs.filter((job) => !ACTIVE_STATUSES.has(job.Status)).length,
        [ jobs ]
    );

    const handleClearFinished = useCallback(async () => {
        if (!__legacyApiClient__) {
            return;
        }

        setIsClearing(true);
        try {
            await __legacyApiClient__.ajax({
                type: 'DELETE',
                url: __legacyApiClient__.getUrl('VideoTools/Jobs/Finished'),
                dataType: 'json'
            });
            await loadJobs();
        } catch (err) {
            console.error('[transcodequeue] failed to clear finished jobs', err);
            toast(globalize.translate('VideoToolsRequestFailed'));
        } finally {
            setIsClearing(false);
        }
    }, [ __legacyApiClient__, loadJobs ]);

    const handleRetry = useCallback(async (job: VideoToolJob) => {
        if (!__legacyApiClient__) {
            return;
        }

        setRetryingId(job.Id);
        try {
            await __legacyApiClient__.ajax({
                type: 'POST',
                url: __legacyApiClient__.getUrl(`VideoTools/Jobs/${job.Id}/Retry`),
                dataType: 'json'
            });
            toast(globalize.translate('VideoToolsStarted'));
            await loadJobs();
        } catch (err) {
            console.error('[transcodequeue] failed to retry job', err);
            toast(globalize.translate('VideoToolsRequestFailed'));
        } finally {
            setRetryingId(null);
        }
    }, [ __legacyApiClient__, loadJobs ]);

    const handleCancel = useCallback(async (job: VideoToolJob) => {
        if (!__legacyApiClient__) {
            return;
        }

        setCancelingId(job.Id);
        try {
            await __legacyApiClient__.ajax({
                type: 'POST',
                url: __legacyApiClient__.getUrl(`VideoTools/Jobs/${job.Id}/Cancel`),
                dataType: 'json'
            });
            toast(globalize.translate('VideoToolsCanceledToast'));
            await loadJobs();
        } catch (err) {
            console.error('[transcodequeue] failed to cancel job', err);
            toast(globalize.translate('VideoToolsRequestFailed'));
        } finally {
            setCancelingId(null);
        }
    }, [ __legacyApiClient__, loadJobs ]);

    const streamUrl = useMemo(() => {
        if (!playingJob || !__legacyApiClient__) {
            return '';
        }

        const token = __legacyApiClient__.accessToken();
        return __legacyApiClient__.getUrl(
            `VideoTools/Jobs/${playingJob.Id}/Stream`,
            token ? { ApiKey: token } : undefined
        );
    }, [ playingJob, __legacyApiClient__ ]);

    let activeContent;
    if (isLoading) {
        activeContent = <LinearProgress />;
    } else if (activeJobs.length > 0) {
        activeContent = (
            <JobTable
                jobs={activeJobs}
                showQueuePosition
                onCancel={handleCancel}
                cancelingId={cancelingId}
            />
        );
    } else {
        activeContent = (
            <Typography color='text.secondary'>
                {globalize.translate('VideoToolsQueueEmpty')}
            </Typography>
        );
    }

    return (
        <Page
            id='transcodeQueuePage'
            title={globalize.translate('TranscodeQueue')}
            className='mainAnimatedPage type-interior'
        >
            <Box className='content-primary'>
                <Box className='readOnlyContent'>
                    <Stack spacing={2} mt={2}>
                        <Typography variant='h5'>{globalize.translate('TranscodeQueue')}</Typography>

                        <Box>
                            <Stack direction='row' alignItems='center' justifyContent='space-between' spacing={2}>
                                <Typography>{globalize.translate('VideoToolsDefaultTranscodeConfig')}</Typography>
                                <Button variant='outlined' size='small' onClick={() => setConfigKind('transcode')}>
                                    {globalize.translate('ButtonConfigure')}
                                </Button>
                            </Stack>
                            <Stack direction='row' alignItems='center' justifyContent='space-between' spacing={2} sx={{ mt: 1 }}>
                                <Typography>{globalize.translate('VideoToolsDefaultCutConfig')}</Typography>
                                <Button variant='outlined' size='small' onClick={() => setConfigKind('cut')}>
                                    {globalize.translate('ButtonConfigure')}
                                </Button>
                            </Stack>
                        </Box>

                        <Typography variant='h6'>{globalize.translate('VideoToolsActiveJobs')}</Typography>
                        <Stack direction='row' alignItems='center' justifyContent='space-between' spacing={2}>
                            <Typography variant='body2' color='text.secondary'>
                                {globalize.translate('VideoToolsQueueHint')}
                            </Typography>
                            <Button
                                variant='outlined'
                                size='small'
                                onClick={handleClearFinished}
                                disabled={isClearing || finishedCount === 0}
                            >
                                {globalize.translate('VideoToolsClearFinished')}
                            </Button>
                        </Stack>
                        {activeContent}

                        {recentJobs.length > 0 && (
                            <>
                                <Typography variant='h6' sx={{ pt: 2 }}>
                                    {globalize.translate('VideoToolsRecentJobs')}
                                </Typography>
                                <JobTable
                                    jobs={recentJobs}
                                    showQueuePosition={false}
                                    onRetry={handleRetry}
                                    retryingId={retryingId}
                                    onPlay={setPlayingJob}
                                />
                            </>
                        )}
                    </Stack>
                </Box>
            </Box>
            {configKind && __legacyApiClient__ && (
                <DefaultsDialog
                    kind={configKind}
                    defaults={defaults}
                    apiClient={__legacyApiClient__}
                    onClose={() => setConfigKind(null)}
                    onSaved={setDefaults}
                />
            )}
            <Dialog
                open={Boolean(playingJob)}
                onClose={() => setPlayingJob(null)}
                maxWidth='md'
                fullWidth
            >
                <DialogTitle>
                    {playingJob?.ItemName}
                </DialogTitle>
                <IconButton
                    aria-label={globalize.translate('ButtonClose')}
                    onClick={() => setPlayingJob(null)}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                >
                    <Close />
                </IconButton>
                <DialogContent>
                    {streamUrl && (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video
                            key={streamUrl}
                            src={streamUrl}
                            controls
                            autoPlay
                            style={{ width: '100%', maxHeight: '70vh', backgroundColor: '#000' }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Page>
    );
};

Component.displayName = 'TranscodeQueuePage';
