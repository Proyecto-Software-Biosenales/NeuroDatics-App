"""Prove candidate instrumentation logs locally without deleting its behavior."""

import logging
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from neurodatics.config import logging as app_logging
from neurodatics.config.security import create_access_token
from neurodatics.main import app
from neurodatics.workers import entrypoint


@pytest.fixture(autouse=True)
def fresh_tombstones():
    original = app_logging._tombstones_seen.copy()
    app_logging._tombstones_seen.clear()
    yield
    app_logging._tombstones_seen.clear()
    app_logging._tombstones_seen.update(original)


def test_tombstone_deduplicates_concurrent_calls_with_context(caplog):
    with caplog.at_level(logging.WARNING, logger='neurodatics.tombstones'):
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: app_logging.tombstone('test.concurrent'), range(20)))
    records = [record for record in caplog.records if 'test.concurrent' in record.message]
    assert len(records) == 1
    assert 'TOMBSTONE 2026-09-03 codex test.concurrent' in records[0].message
    assert 'test_cleanup_tombstones.py:' in records[0].message
    assert 'pid=' in records[0].message


def test_tombstone_records_again_in_another_process(monkeypatch, caplog):
    with caplog.at_level(logging.WARNING, logger='neurodatics.tombstones'):
        monkeypatch.setattr(app_logging.os, 'getpid', lambda: 1)
        app_logging.tombstone('test.process')
        monkeypatch.setattr(app_logging.os, 'getpid', lambda: 2)
        app_logging.tombstone('test.process')
    assert len([r for r in caplog.records if 'test.process' in r.message]) == 2


def test_authenticated_api_hit_logs_and_preserves_response(caplog):
    token = create_access_token('synthetic-user', None, None)
    with caplog.at_level(logging.WARNING, logger='neurodatics.tombstones'):
        response = TestClient(app).get('/api/integrations/google-drive/sync-tasks',
                                      headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200
    assert set(response.json()) == {'total_tasks', 'tasks'}
    assert 'gdrive.list_all_sync_tasks' in caplog.text
    assert token not in caplog.text


def test_worker_entry_logs_and_still_starts_worker(monkeypatch, caplog):
    worker = Mock()
    redis = Mock()
    factory = Mock(return_value=worker)
    monkeypatch.setattr(entrypoint, 'Worker', factory)
    monkeypatch.setattr(entrypoint, 'get_redis_worker_client', lambda: redis)
    monkeypatch.setattr(entrypoint.signal, 'signal', Mock())
    with caplog.at_level(logging.WARNING, logger='neurodatics.tombstones'):
        entrypoint.WorkerManager().start()
    factory.assert_called_once_with(queues=['default'], connection=redis)
    worker.work.assert_called_once_with(with_scheduler=False)
    assert 'workers.entrypoint' in caplog.text
