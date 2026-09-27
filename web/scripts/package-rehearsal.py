#!/usr/bin/env python3
"""Measure a complete candidate Git bundle without modifying the worker's read-only .git.

All temporary repositories and bundle files stay in the assignment's disposable test/scratch/.
This is packaging evidence, not a commit to the submission workspace.
"""
import json
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
LIMIT = 8_388_608


def git(*args, cwd=ROOT):
    return subprocess.check_output(["git", *args], cwd=cwd, stderr=subprocess.PIPE)


def allowed(path):
    if path == "web/.gitignore":
        return True
    parts = pathlib.PurePosixPath(path).parts
    return parts[0] in {"web", "dist", "docs"} and not any(p.startswith(".") for p in parts)


changed = set(filter(None, git("diff", "HEAD", "--name-only", "-z").decode().split("\0")))
untracked = set(filter(None, git("ls-files", "--others", "--exclude-standard", "-z").decode().split("\0")))
candidate_changes = sorted(changed | {p for p in untracked if not p.startswith("test/scratch/")})
assert all(allowed(p) for p in candidate_changes), "Out-of-scope change: " + str([p for p in candidate_changes if not allowed(p)])
assert not any("node_modules" in pathlib.PurePosixPath(p).parts or ".cache" in pathlib.PurePosixPath(p).parts or p.endswith(".tgz") for p in candidate_changes)
assert not any(line.startswith(b"160000 ") for line in git("ls-files", "-s").splitlines()), "Submodule found"

scoped_files = set(filter(None, git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "web", "dist", "docs").decode().split("\0")))
scoped_files.discard("docs/frontend/submission-size.json")  # Evidence produced after the measured snapshot.
scratch_parent = ROOT / "test/scratch"
scratch_parent.mkdir(parents=True, exist_ok=True)
scratch = pathlib.Path(tempfile.mkdtemp(prefix="band-packaging-", dir=scratch_parent))
try:
    checkout = scratch / "candidate"
    git("clone", "--no-hardlinks", str(ROOT), str(checkout))
    for path in sorted(scoped_files):
        source = ROOT / path
        target = checkout / path
        if source.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        elif target.exists():
            target.unlink()
    git("add", "--", "web", "dist", "docs", cwd=checkout)
    git("-c", "user.name=Packaging rehearsal", "-c", "user.email=packaging-check@invalid",
        "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-m",
        "Local packaging rehearsal; not a worker workspace commit", cwd=checkout)
    bundle = scratch / "candidate.bundle"
    git("bundle", "create", str(bundle), "--all", cwd=checkout)
    git("bundle", "verify", str(bundle), cwd=checkout)
    bundle_bytes = bundle.stat().st_size
    assert bundle_bytes + 131_072 < LIMIT, "Bundle leaves insufficient room for measurement evidence"
    tree_files = [p for p in git("ls-files", "-z", cwd=checkout).decode().split("\0") if p]
    assert not any("node_modules" in pathlib.PurePosixPath(p).parts or ".cache" in pathlib.PurePosixPath(p).parts or p.endswith(".tgz") for p in tree_files)
    assert not any(line.startswith(b"160000 ") for line in git("ls-files", "-s", cwd=checkout).splitlines())
    export_files = [p for p in (ROOT / "dist").rglob("*") if p.is_file()]
    report = {
        "workspaceCommitCreated": False,
        "method": "Clone existing full Git history into disposable test/scratch, copy all nonignored scoped source/export/evidence, commit only in scratch, create and verify bundle --all. Delete rehearsal afterward.",
        "scopeCheck": "passed; only web/**, dist/**, docs/** and explicitly budgeted web/.gitignore",
        "gitBundleVerified": True,
        "candidateBundleBytes": bundle_bytes,
        "evidenceAllowanceBytes": 131_072,
        "conservativeTotalBytes": bundle_bytes + 131_072,
        "limitBytes": LIMIT,
        "note": "The measurement report itself is the only delivered file excluded from the measured snapshot; a 128 KiB allowance covers it and Git metadata variation. The bundle is test scaffolding and is not submitted.",
        "candidateTrackedFileCount": len(tree_files),
        "candidateRawFileBytes": sum((checkout / p).stat().st_size for p in tree_files),
        "exportFileCountIncludingManifest": len(export_files),
        "exportBytesIncludingManifest": sum(p.stat().st_size for p in export_files),
        "generatedDependencyOrCacheFiles": 0,
        "submodules": 0,
    }
    (ROOT / "docs/frontend/submission-size.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
finally:
    shutil.rmtree(scratch)
