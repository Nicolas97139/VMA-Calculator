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
from datetime import datetime


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
