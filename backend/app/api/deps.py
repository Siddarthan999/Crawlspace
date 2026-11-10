from fastapi import Depends
from sqlalchemy.orm import Session
from ..db import get_db

DB = Depends(get_db)
