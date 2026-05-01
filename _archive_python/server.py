from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class RFQSubmission(BaseModel):
    name: str
    company: str
    email: str
    phone: Optional[str] = ""
    inquiry_type: str
    project_scope: Optional[str] = ""
    message: Optional[str] = ""

class RFQResponse(BaseModel):
    id: str
    name: str
    company: str
    email: str
    inquiry_type: str
    submitted_at: str
    status: str


# Routes
@api_router.get("/")
async def root() -> dict[str, str]:
    return {"message": "Hi-MAK API Running"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate) -> StatusCheck:
    status_dict: dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc: dict = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks() -> List[StatusCheck]:
    status_checks: list = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks

@api_router.post("/rfq", response_model=RFQResponse)
async def submit_rfq(data: RFQSubmission) -> RFQResponse:
    rfq_id: str = str(uuid.uuid4())[:8].upper()
    now: str = datetime.now(timezone.utc).isoformat()

    doc: dict = {
        "id": rfq_id,
        "name": data.name,
        "company": data.company,
        "email": data.email,
        "phone": data.phone,
        "inquiry_type": data.inquiry_type,
        "project_scope": data.project_scope,
        "message": data.message,
        "submitted_at": now,
        "status": "new",
    }
    _ = await db.rfq_submissions.insert_one(doc)

    logger.info(f"RFQ submitted: {rfq_id} from {data.company} ({data.email}) - {data.inquiry_type}")

    return RFQResponse(
        id=rfq_id,
        name=data.name,
        company=data.company,
        email=data.email,
        inquiry_type=data.inquiry_type,
        submitted_at=now,
        status="new",
    )

@api_router.get("/rfq", response_model=List[RFQResponse])
async def get_rfq_submissions() -> List[RFQResponse]:
    submissions: list = await db.rfq_submissions.find({}, {"_id": 0}).to_list(1000)
    return submissions


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()
