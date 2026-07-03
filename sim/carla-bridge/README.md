# CARLA Camera Bridge

Streams fixed CARLA RGB camera sensors into the D4D COP dashboard through
`/api/carla-cameras/:id/frame`.

## Run CARLA on the GPU server

```bash
docker run -d --name d4d-carla --rm --gpus all --net=host --shm-size=8g \
  -e NVIDIA_VISIBLE_DEVICES=all \
  -e NVIDIA_DRIVER_CAPABILITIES=all \
  carlasim/carla:0.9.16 bash CarlaUE4.sh -RenderOffScreen -nosound
```

## Prepare the Python client

The CARLA Docker image ships Python client wheels in
`/workspace/PythonAPI/carla/dist`. On the GPU server:

```bash
python3.12 -m venv ~/carla-client-venv
docker cp d4d-carla:/workspace/PythonAPI/carla/dist/carla-0.9.16-cp312-cp312-manylinux_2_31_x86_64.whl /tmp/
~/carla-client-venv/bin/pip install /tmp/carla-0.9.16-cp312-cp312-manylinux_2_31_x86_64.whl numpy pillow
```

## Run the bridge

Start D4D with a host-visible Vite server, then set `d4d_origin` in
`config.json` to that reachable URL.

```bash
~/carla-client-venv/bin/python bridge.py config.json
```

The dashboard should show `CARLA SIM CCTV` with one tile per configured camera.
