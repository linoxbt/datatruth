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


class DataTruth(gl.contract.Contract):
    audits: gl.storage.DynArray[Audit]
    bond_amount: u256

    def __init__(self, bond_amount: u256):
        if bond_amount == u256(0):
            raise gl.vm.UserError("Bond must be positive")
        self.bond_amount = bond_amount

    @gl.public.write.payable
    def register_audit(self, source_url: str, cid: str, proof_sha256: str) -> u256:
        if gl.message.value != self.bond_amount:
            raise gl.vm.UserError("Exact bond required")
        if not source_url.startswith("https://") or len(source_url) > 1024:
            raise gl.vm.UserError("Invalid source URL")
        if not cid.startswith("Qm") or len(cid) != 46:
            raise gl.vm.UserError("Expected CIDv0")
        if len(proof_sha256) != 64 or any(c not in "0123456789abcdef" for c in proof_sha256):
            raise gl.vm.UserError("Invalid proof hash")
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
        ))
        return token_id

    @gl.public.write
    def challenge(self, token_id: u256) -> None:
        audit = self._get(token_id)
        if audit.status != "Pending":
            raise gl.vm.UserError("Audit is not pending")
        if gl.message.sender_address == audit.provider:
            raise gl.vm.UserError("Provider cannot challenge own audit")
        audit.challenger = gl.message.sender_address
        audit.status = "Challenged"

    @gl.public.write
    def resolve(self, token_id: u256) -> bool:
        audit = self._get(token_id)
        if audit.status != "Challenged":
            raise gl.vm.UserError("Audit is not challenged")
        cid = audit.cid
        proof_hash = audit.proof_sha256
        source_url = audit.source_url

        def verify_proof() -> bool:
            response = gl.nondet.web.get("https://gateway.pinata.cloud/ipfs/" + cid)
            if response.status_code != 200:
                raise gl.vm.UserError("Proof unavailable; retry after IPFS propagation")
            body = response.body
            if len(body) > 1_500_000:
                return False
            if hashlib.sha256(body).hexdigest() != proof_hash:
                return False
            try:
                proof = json.loads(body.decode("utf-8"))
                if proof.get("schema") != "datatruth/v1" or proof.get("sourceUrl") != source_url:
                    return False
                raw = proof["rawCsv"]
                if not isinstance(raw, str) or len(raw.encode("utf-8")) > 1_000_000:
                    return False
                if hashlib.sha256(raw.encode("utf-8")).hexdigest() != proof.get("rawSha256"):
                    return False
                records = list(csv.reader(raw.splitlines(keepends=True), skipinitialspace=True))
                records = [row for row in records if row]
                if len(records) < 2:
                    return False
                headers, rows = records[0], records[1:]
                headers[0] = headers[0].lstrip("\ufeff")
                if not headers or any(not h.strip() for h in headers) or len(set(headers)) != len(headers):
                    return False
                if any(len(row) != len(headers) for row in rows):
                    return False
                metrics = proof["metrics"]
                missing = [sum(1 for row in rows if not row[i].strip()) for i in range(len(headers))]
                duplicates = len(rows) - len({tuple(row) for row in rows})
                return metrics == {
                    "rows": len(rows), "columns": len(headers), "headers": headers,
                    "missing": missing, "duplicates": duplicates,
                }
            except (KeyError, TypeError, ValueError, UnicodeDecodeError, csv.Error):
                return False

        approved = gl.eq_principle.strict_eq(verify_proof)
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
