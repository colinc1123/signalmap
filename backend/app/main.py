from fastapi import FastAPI

app = FastAPI(title="SignalMap API")


@app.get("/")
def root():
    return {"message": "SignalMap API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}