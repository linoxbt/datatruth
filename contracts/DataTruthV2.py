# {
#   "Seq": [
#     { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
#   ]
# }
"""GenLayer-native audit registry, challenge court, and GEN bond escrow."""

import genlayer as gl
from genlayer.types import *
from dataclasses import dataclass
from datetime import datetime, timezone
import csv
import hashlib
import json
import re


@gl.evm.contract_interface
class Recipient:
    class View:
        pass

    class Write:
        pass


@gl.storage.allow
@dataclass
class Audit:
    provider: Address
    challenger: Address
    source_url: str
    cid: str
    proof_sha256: str
    bond: u256
    registered_at: u256
    status: str
    claim_cid: str
    claim_sha256: str
    claim_raw_sha256: str
    challenged_at: u256


class DataTruth(gl.contract.Contract):
    audits: gl.storage.DynArray[Audit]
    bond_amount: u256

    def __init__(self, bond_amount: u256):
        if bond_amount == u256(0):
            raise gl.vm.UserError("Bond must be positive")
        self.bond_amount = bond_amount

    def _valid_source(self, source_url: str) -> bool:
        # GitHub commit URLs identify an immutable object. A branch URL can change
        # between registration and the challenge and cannot prove provenance.
        return bool(re.fullmatch(
            r"https://raw\.githubusercontent\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/[0-9a-f]{40}/[A-Za-z0-9_./-]+",
            source_url,
        )) and ".." not in source_url.split("/")

    def _valid_evidence(self, cid: str, proof_sha256: str) -> bool:
        return (cid.startswith("Qm") and len(cid) == 46 and len(proof_sha256) == 64
                and all(c in "0123456789abcdef" for c in proof_sha256))

    @gl.public.write.payable
    def register_audit(self, source_url: str, cid: str, proof_sha256: str) -> u256:
        if gl.message.value != self.bond_amount:
            raise gl.vm.UserError("Exact bond required")
        if len(source_url) > 1024 or not self._valid_source(source_url):
            raise gl.vm.UserError("Use an immutable GitHub raw commit URL")
        if not self._valid_evidence(cid, proof_sha256):
            raise gl.vm.UserError("Invalid CIDv0 or proof hash")
        token_id = u256(len(self.audits))
        self.audits.append(Audit(
            provider=gl.message.sender_address,
            challenger=Address("0x0000000000000000000000000000000000000000"),
            source_url=source_url,
            cid=cid,
            proof_sha256=proof_sha256,
            bond=self.bond_amount,
            registered_at=u256(int(datetime.now(timezone.utc).timestamp())),
            status="Pending",
            claim_cid="",
            claim_sha256="",
            claim_raw_sha256="",
            challenged_at=u256(0),
        ))
        return token_id

    @gl.public.write
    def file_claim(self, token_id: u256, claim_cid: str, claim_sha256: str) -> None:
        audit = self._get(token_id)
        if audit.status != "Pending":
            raise gl.vm.UserError("Audit is not pending")
        if gl.message.sender_address == audit.provider:
            raise gl.vm.UserError("Provider cannot challenge own audit")
        if int(datetime.now(timezone.utc).timestamp()) >= int(audit.registered_at) + 7 * 86400:
            raise gl.vm.UserError("Challenge window has closed")
        if not self._valid_evidence(claim_cid, claim_sha256):
            raise gl.vm.UserError("Invalid claim CID or hash")
        source_url = audit.source_url

        def verify_claim() -> str:
            try:
                source = gl.nondet.web.get(source_url)
                if source.status != 200 or len(source.body) > 1_000_000:
                    return ""
                raw_hash = self._proof_raw_hash(claim_cid, claim_sha256, source_url)
                return raw_hash if raw_hash == hashlib.sha256(source.body).hexdigest() else ""
            except Exception:
                return ""

        claim_raw_hash = gl.eq_principle.strict_eq(verify_claim)
        if len(claim_raw_hash) != 64:
            raise gl.vm.UserError("Claim does not match the immutable source")
        audit.challenger = gl.message.sender_address
        audit.claim_cid = claim_cid
        audit.claim_sha256 = claim_sha256
        audit.claim_raw_sha256 = claim_raw_hash
        audit.challenged_at = u256(int(datetime.now(timezone.utc).timestamp()))
        audit.status = "Challenged"

    def _proof_raw_hash(self, cid: str, proof_hash: str, source_url: str) -> str:
        body = None
        for gateway in ("https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/"):
            try:
                response = gl.nondet.web.get(gateway + cid)
                if response.status == 200:
                    body = response.body
                    break
            except Exception:
                pass
        if body is None:
            return "unavailable"
        try:
            if len(body) > 1_500_000:
                return "invalid"
            if hashlib.sha256(body).hexdigest() != proof_hash:
                return "invalid"
            proof = json.loads(body.decode("utf-8"))
            if proof.get("schema") != "datatruth/v1" or proof.get("sourceUrl") != source_url:
                return "invalid"
            raw = proof["rawCsv"]
            if not isinstance(raw, str) or len(raw.encode("utf-8")) > 1_000_000:
                return "invalid"
            raw_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
            if raw_hash != proof.get("rawSha256"):
                return "invalid"
            records = list(csv.reader(raw.splitlines(keepends=True), skipinitialspace=False))
            records = [row for row in records if row]
            if len(records) < 2:
                return "invalid"
            headers, rows = records[0], records[1:]
            headers[0] = headers[0].lstrip("\ufeff")
            if not headers or any(not h.strip() for h in headers) or len(set(headers)) != len(headers):
                return "invalid"
            if any(len(row) != len(headers) for row in rows):
                return "invalid"
            missing = [sum(1 for row in rows if not row[i].strip()) for i in range(len(headers))]
            duplicates = len(rows) - len({tuple(row) for row in rows})
            if proof["metrics"] != {
                "rows": len(rows), "columns": len(headers), "headers": headers,
                "missing": missing, "duplicates": duplicates,
            }:
                return "invalid"
            return raw_hash
        except (KeyError, TypeError, ValueError, UnicodeDecodeError, csv.Error):
            return "invalid"

    @gl.public.write
    def resolve(self, token_id: u256) -> bool:
        audit = self._get(token_id)
        if audit.status != "Challenged":
            raise gl.vm.UserError("Audit is not challenged")
        cid, proof_hash, source_url = audit.cid, audit.proof_sha256, audit.source_url

        def verify_proof() -> str:
            return self._proof_raw_hash(cid, proof_hash, source_url)

        result = gl.eq_principle.strict_eq(verify_proof)
        if result == "unavailable" and int(datetime.now(timezone.utc).timestamp()) < int(audit.challenged_at) + 30 * 86400:
            raise gl.vm.UserError("Provider proof unavailable; retry before 30-day deadline")
        approved = result == audit.claim_raw_sha256
        audit.status = "Verified" if approved else "Rejected"
        recipient = audit.provider if approved else audit.challenger
        Recipient(recipient).emit_transfer(value=audit.bond)
        return approved

    @gl.public.write
    def release_unchallenged(self, token_id: u256) -> None:
        audit = self._get(token_id)
        if audit.status != "Pending":
            raise gl.vm.UserError("Audit is not pending")
        if gl.message.sender_address != audit.provider:
            raise gl.vm.UserError("Only provider can release")
        now = int(datetime.now(timezone.utc).timestamp())
        if now < int(audit.registered_at) + 7 * 86400:
            raise gl.vm.UserError("Seven-day challenge window is open")
        audit.status = "Unchallenged"
        Recipient(audit.provider).emit_transfer(value=audit.bond)

    @gl.public.view
    def get_audit(self, token_id: u256) -> Audit:
        return self._get(token_id)

    @gl.public.view
    def audit_count(self) -> u256:
        return u256(len(self.audits))

    def _get(self, token_id: u256) -> Audit:
        if int(token_id) >= len(self.audits):
            raise gl.vm.UserError("Unknown audit")
        return self.audits[int(token_id)]
