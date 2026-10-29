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
    OutputPath: string;
    Error?: string | null;
    CreatedAt: string;
};

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

    return [job.Codec, job.Resolution, job.BitrateKbps ? `${job.BitrateKbps} kbps` : null]
        .filter(Boolean)
        .join(' · ');
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

export const Component = () => {
    const { __legacyApiClient__ } = useApi();
    const [ jobs, setJobs ] = useState<VideoToolJob[]>([]);
    const [ isLoading, setIsLoading ] = useState(true);
    const [ isClearing, setIsClearing ] = useState(false);
    const [ retryingId, setRetryingId ] = useState<string | null>(null);
    const [ cancelingId, setCancelingId ] = useState<string | null>(null);
    const [ playingJob, setPlayingJob ] = useState<VideoToolJob | null>(null);

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
                        <Box>
                            <Stack direction='row' alignItems='flex-start' justifyContent='space-between' spacing={2}>
                                <Box>
                                    <Typography variant='h5'>{globalize.translate('TranscodeQueue')}</Typography>
                                    <Typography variant='body2' color='text.secondary'>
                                        {globalize.translate('VideoToolsQueueHint')}
                                    </Typography>
                                </Box>
                                <Button
                                    variant='outlined'
                                    size='small'
                                    onClick={handleClearFinished}
                                    disabled={isClearing || finishedCount === 0}
                                >
                                    {globalize.translate('VideoToolsClearFinished')}
                                </Button>
                            </Stack>
                        </Box>

                        <Typography variant='h6'>{globalize.translate('VideoToolsActiveJobs')}</Typography>
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
