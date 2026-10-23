from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class VMACalculation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vma_value: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None

class VMACalculationCreate(BaseModel):
    vma_value: float
    notes: Optional[str] = None

class TrainingZone(BaseModel):
    name: str
    percentage_min: int
    percentage_max: int
    description: str
    speed_min: float
    speed_max: float
    pace_min: str  # Format: "mm:ss"
    pace_max: str  # Format: "mm:ss"

class VMAIntensityResult(BaseModel):
    vma_value: float
    zones: List[TrainingZone]


def speed_to_pace(speed_kmh: float) -> str:
    """Convert speed (km/h) to pace (min:sec per km)"""
    if speed_kmh <= 0:
        return "--:--"
    minutes_per_km = 60 / speed_kmh
    minutes = int(minutes_per_km)
    seconds = int((minutes_per_km - minutes) * 60)
    return f"{minutes}:{seconds:02d}"


def calculate_intensity_zones(vma: float) -> List[TrainingZone]:
    """Calculate all training zones based on VMA value"""
    zones_config = [
        {"name": "Récupération", "min": 50, "max": 60, "description": "Récupération active, footing très lent"},
        {"name": "Endurance fondamentale", "min": 60, "max": 70, "description": "Endurance de base, footing confortable"},
        {"name": "Endurance active", "min": 70, "max": 80, "description": "Footing soutenu, développement aérobie"},
        {"name": "Seuil anaérobie", "min": 80, "max": 90, "description": "Travail au seuil, tempo run"},
        {"name": "VMA longue", "min": 90, "max": 95, "description": "Intervalles longs (3-5 min)"},
        {"name": "VMA", "min": 95, "max": 100, "description": "Travail à VMA, intervalles moyens"},
        {"name": "VMA courte", "min": 100, "max": 105, "description": "Intervalles courts (30s-1min)"},
        {"name": "Vitesse", "min": 105, "max": 110, "description": "Sprint et vitesse pure"},
    ]
    
    zones = []
    for zone in zones_config:
        speed_min = vma * (zone["min"] / 100)
        speed_max = vma * (zone["max"] / 100)
        pace_min = speed_to_pace(speed_max)  # Faster speed = lower pace
        pace_max = speed_to_pace(speed_min)  # Slower speed = higher pace
        
        zones.append(TrainingZone(
            name=zone["name"],
            percentage_min=zone["min"],
            percentage_max=zone["max"],
            description=zone["description"],
            speed_min=round(speed_min, 1),
            speed_max=round(speed_max, 1),
            pace_min=pace_min,
            pace_max=pace_max
        ))
    
    return zones


# Add your routes to the router
@api_router.get("/")
async def root():
    return {"message": "VMA Calculator API"}


@api_router.post("/calculate", response_model=VMAIntensityResult)
async def calculate_vma_intensity(vma_value: float):
    """Calculate training zones for a given VMA value"""
    if vma_value <= 0 or vma_value > 30:
        raise HTTPException(status_code=400, detail="VMA doit être entre 1 et 30 km/h")
    
    zones = calculate_intensity_zones(vma_value)
    return VMAIntensityResult(vma_value=vma_value, zones=zones)


@api_router.post("/history", response_model=VMACalculation)
async def save_calculation(input: VMACalculationCreate):
    """Save a VMA calculation to history"""
    if input.vma_value <= 0 or input.vma_value > 30:
        raise HTTPException(status_code=400, detail="VMA doit être entre 1 et 30 km/h")
    
    calc_dict = input.model_dump()
    calc_obj = VMACalculation(**calc_dict)
    _ = await db.vma_calculations.insert_one(calc_obj.model_dump())
    return calc_obj


@api_router.get("/history", response_model=List[VMACalculation])
async def get_calculation_history():
    """Get all saved VMA calculations"""
    calculations = await db.vma_calculations.find().sort("timestamp", -1).to_list(100)
    return [VMACalculation(**calc) for calc in calculations]


@api_router.delete("/history/{calc_id}")
async def delete_calculation(calc_id: str):
    """Delete a calculation from history"""
    result = await db.vma_calculations.delete_one({"id": calc_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Calcul non trouvé")
    return {"message": "Calcul supprimé"}


# ---- Runner sessions (history per runner) ----
class SessionPerformance(BaseModel):
    distance: float = Field(gt=0)
    time: str
    time_seconds: int = Field(gt=0)
    speed: float
    pace: str
    percentage: int
    zone_name: Optional[str] = None
    zone_index: int


class RunnerSessionBase(BaseModel):
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    vma_value: float = Field(gt=0, le=30)
    performances: List[SessionPerformance] = Field(min_length=1)


class RunnerSessionCreate(RunnerSessionBase):
    group_id: Optional[str] = None


class RunnerSession(RunnerSessionBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    runner_key: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NewRecord(BaseModel):
    distance: float
    time: str
    time_seconds: int
    previous_time_seconds: Optional[int] = None
    improvement_seconds: Optional[int] = None


class RunnerSessionSaved(RunnerSession):
    new_records: List[NewRecord] = []


class Runner(BaseModel):
    first_name: str
    last_name: str
    session_count: int
    last_session: datetime
    group_id: Optional[str] = None
    group_name: Optional[str] = None


class RunnerProfile(BaseModel):
    first_name: str
    last_name: str
    group_id: Optional[str] = None
    group_name: Optional[str] = None


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    name_key: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GroupWithCount(BaseModel):
    id: str
    name: str
    member_count: int


class LeaderboardEntry(BaseModel):
    first_name: str
    last_name: str
    time: str
    time_seconds: int
    speed: float
    date: datetime


class DistanceLeaderboard(BaseModel):
    distance: float
    entries: List[LeaderboardEntry]


def make_runner_key(first_name: str, last_name: str) -> str:
    return f"{first_name.strip().casefold()}|{last_name.strip().casefold()}"


def best_by_distance(sessions: List[dict]) -> dict:
    """Fastest run per distance: {distance: (performance, session)}"""
    best = {}
    for s in sessions:
        for p in s["performances"]:
            d = p["distance"]
            if d not in best or p["time_seconds"] < best[d][0]["time_seconds"]:
                best[d] = (p, s)
    return best


@api_router.post("/sessions", response_model=RunnerSessionSaved)
async def create_session(input: RunnerSessionCreate):
    """Save a training session (all races) for a runner, detect new personal records"""
    first, last = input.first_name.strip(), input.last_name.strip()
    if not first or not last:
        raise HTTPException(status_code=400, detail="Prénom et nom requis")
    if input.group_id and not await db.groups.find_one({"id": input.group_id}):
        raise HTTPException(status_code=404, detail="Groupe non trouvé")

    key = make_runner_key(first, last)
    previous = await db.runner_sessions.find({"runner_key": key}, {"_id": 0}).to_list(1000)
    previous_best = best_by_distance(previous)

    session = RunnerSession(
        **{**input.model_dump(exclude={"group_id"}), "first_name": first, "last_name": last},
        runner_key=key,
    )
    await db.runner_sessions.insert_one(session.model_dump())
    await db.runner_profiles.update_one(
        {"runner_key": key},
        {"$set": {"runner_key": key, "first_name": first, "last_name": last, "group_id": input.group_id}},
        upsert=True,
    )

    new_records = []
    for d, (p, _) in best_by_distance([session.model_dump()]).items():
        prev = previous_best.get(d)
        prev_secs = prev[0]["time_seconds"] if prev else None
        if prev_secs is None or p["time_seconds"] < prev_secs:
            new_records.append(NewRecord(
                distance=d,
                time=p["time"],
                time_seconds=p["time_seconds"],
                previous_time_seconds=prev_secs,
                improvement_seconds=(prev_secs - p["time_seconds"]) if prev_secs is not None else None,
            ))
    new_records.sort(key=lambda r: r.distance)
    return RunnerSessionSaved(**session.model_dump(), new_records=new_records)


@api_router.get("/sessions", response_model=List[RunnerSession])
async def get_sessions(first_name: str, last_name: str):
    """Get all sessions of a runner, most recent first"""
    key = make_runner_key(first_name, last_name)
    sessions = await db.runner_sessions.find({"runner_key": key}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return sessions


@api_router.get("/runners", response_model=List[Runner])
async def get_runners(group_id: Optional[str] = None):
    """List every runner having at least one saved session (optionally filtered by group)"""
    pipeline = [
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$runner_key",
            "first_name": {"$first": "$first_name"},
            "last_name": {"$first": "$last_name"},
            "session_count": {"$sum": 1},
            "last_session": {"$first": "$created_at"},
        }},
    ]
    runners = await db.runner_sessions.aggregate(pipeline).to_list(1000)
    profiles = {p["runner_key"]: p for p in await db.runner_profiles.find({}, {"_id": 0}).to_list(5000)}
    group_names = {g["id"]: g["name"] for g in await db.groups.find({}, {"_id": 0}).to_list(1000)}

    result = []
    for r in runners:
        gid = profiles.get(r["_id"], {}).get("group_id")
        gid = gid if gid in group_names else None
        if group_id and gid != group_id:
            continue
        result.append(Runner(
            **{k: v for k, v in r.items() if k != "_id"},
            group_id=gid,
            group_name=group_names.get(gid),
        ))
    result.sort(key=lambda r: (r.last_name.casefold(), r.first_name.casefold()))
    return result


@api_router.get("/runners/profile", response_model=RunnerProfile)
async def get_runner_profile(first_name: str, last_name: str):
    """Runner profile (current group) used to prefill the group picker"""
    profile = await db.runner_profiles.find_one({"runner_key": make_runner_key(first_name, last_name)}, {"_id": 0})
    gid = profile.get("group_id") if profile else None
    group = await db.groups.find_one({"id": gid}, {"_id": 0}) if gid else None
    return RunnerProfile(
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        group_id=group["id"] if group else None,
        group_name=group["name"] if group else None,
    )


# ---- Training groups ----
async def group_member_counts() -> dict:
    rows = await db.runner_profiles.aggregate([
        {"$match": {"group_id": {"$ne": None}}},
        {"$group": {"_id": "$group_id", "n": {"$sum": 1}}},
    ]).to_list(1000)
    return {r["_id"]: r["n"] for r in rows}


@api_router.get("/groups", response_model=List[GroupWithCount])
async def list_groups():
    groups = await db.groups.find({}, {"_id": 0}).to_list(1000)
    counts = await group_member_counts()
    result = [GroupWithCount(id=g["id"], name=g["name"], member_count=counts.get(g["id"], 0)) for g in groups]
    result.sort(key=lambda g: g.name.casefold())
    return result


@api_router.post("/groups", response_model=GroupWithCount)
async def create_group(input: GroupCreate):
    """Create a group (returns the existing one if the name is already used)"""
    name = input.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom de groupe requis")
    existing = await db.groups.find_one({"name_key": name.casefold()}, {"_id": 0})
    if existing:
        count = await db.runner_profiles.count_documents({"group_id": existing["id"]})
        return GroupWithCount(id=existing["id"], name=existing["name"], member_count=count)
    group = Group(name=name, name_key=name.casefold())
    await db.groups.insert_one(group.model_dump())
    return GroupWithCount(id=group.id, name=group.name, member_count=0)


@api_router.put("/groups/{group_id}", response_model=GroupWithCount)
async def rename_group(group_id: str, input: GroupCreate):
    name = input.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom de groupe requis")
    if not await db.groups.find_one({"id": group_id}):
        raise HTTPException(status_code=404, detail="Groupe non trouvé")
    if await db.groups.find_one({"name_key": name.casefold(), "id": {"$ne": group_id}}):
        raise HTTPException(status_code=409, detail="Un groupe porte déjà ce nom")
    await db.groups.update_one({"id": group_id}, {"$set": {"name": name, "name_key": name.casefold()}})
    count = await db.runner_profiles.count_documents({"group_id": group_id})
    return GroupWithCount(id=group_id, name=name, member_count=count)


@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str):
    """Delete a group: its runners and their sessions are kept, they just leave the group"""
    result = await db.groups.delete_one({"id": group_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Groupe non trouvé")
    await db.runner_profiles.update_many({"group_id": group_id}, {"$set": {"group_id": None}})
    return {"message": "Groupe supprimé"}


class RunnerGroupUpdate(BaseModel):
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    group_id: Optional[str] = None


@api_router.put("/runners/group", response_model=RunnerProfile)
async def set_runner_group(input: RunnerGroupUpdate):
    """Move a runner to another group (group_id null = no group)"""
    first, last = input.first_name.strip(), input.last_name.strip()
    if not first or not last:
        raise HTTPException(status_code=400, detail="Prénom et nom requis")
    group = None
    if input.group_id:
        group = await db.groups.find_one({"id": input.group_id}, {"_id": 0})
        if not group:
            raise HTTPException(status_code=404, detail="Groupe non trouvé")
    key = make_runner_key(first, last)
    await db.runner_profiles.update_one(
        {"runner_key": key},
        {"$set": {"runner_key": key, "first_name": first, "last_name": last, "group_id": input.group_id}},
        upsert=True,
    )
    return RunnerProfile(
        first_name=first,
        last_name=last,
        group_id=input.group_id,
        group_name=group["name"] if group else None,
    )


@api_router.get("/groups/{group_id}/leaderboard", response_model=List[DistanceLeaderboard])
async def group_leaderboard(group_id: str):
    """Best time of each group member for every distance, fastest first"""
    if not await db.groups.find_one({"id": group_id}):
        raise HTTPException(status_code=404, detail="Groupe non trouvé")
    members = await db.runner_profiles.find({"group_id": group_id}, {"_id": 0, "runner_key": 1}).to_list(5000)
    keys = [m["runner_key"] for m in members]
    sessions = await db.runner_sessions.find({"runner_key": {"$in": keys}}, {"_id": 0}).to_list(10000)

    by_runner = {}
    for s in sessions:
        by_runner.setdefault(s["runner_key"], []).append(s)

    boards = {}
    for runner_sessions in by_runner.values():
        for d, (p, s) in best_by_distance(runner_sessions).items():
            boards.setdefault(d, []).append(LeaderboardEntry(
                first_name=s["first_name"],
                last_name=s["last_name"],
                time=p["time"],
                time_seconds=p["time_seconds"],
                speed=p["speed"],
                date=s["created_at"],
            ))
    result = [DistanceLeaderboard(distance=d, entries=sorted(e, key=lambda x: x.time_seconds)) for d, e in boards.items()]
    result.sort(key=lambda b: (-len(b.entries), b.distance))
    return result


@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    result = await db.runner_sessions.delete_one({"id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Séance non trouvée")
    return {"message": "Séance supprimée"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
