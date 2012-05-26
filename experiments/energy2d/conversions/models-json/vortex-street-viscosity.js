var models_library = models_library || {};
models_library.vortex_street_viscosity = {
  "model": {
    "timestep": 0.5,
    "measurement_interval": 100,
    "viewupdate_interval": 10,
    "sun_angle": 1.5707964,
    "solar_power_density": 2000.0,
    "solar_ray_count": 24,
    "solar_ray_speed": 0.1,
    "photon_emission_interval": 20,
    "z_heat_diffusivity": 0.0,
    "background_conductivity": 0.5,
    "background_viscosity": 5.0E-4,
    "thermal_buoyancy": 0.0,
    "buoyancy_approximation": 1,
    "boundary": {
      "flux_at_border": {
        "upper": -10.0,
        "lower": 10.0,
        "left": 10.0,
        "right": -10.0
      }
    },
    "structure": {
      "part": [
        {
          "rectangle": {
            "x": 0.0,
            "y": 4.0,
            "width": 0.5,
            "height": 2.0
          },
          "thermal_conductivity": 0.08,
          "specific_heat": 1300.0,
          "density": 25.0,
          "transmission": 0.0,
          "reflection": 0.0,
          "absorption": 1.0,
          "emissivity": 0.0,
          "temperature": 20.0,
          "constant_temperature": true,
          "wind_speed": 0.1,
          "texture": {
            "texture_fg": -0x1,
            "texture_bg": -0x99999a,
            "texture_style": 7,
            "texture_width": 8,
            "texture_height": 8
          },
          "label": "Fan"
        },
        {
          "ellipse": {
            "x": 2.0,
            "y": 4.949999690055847,
            "a": 1.8,
            "b": 1.8
          },
          "thermal_conductivity": 0.08,
          "specific_heat": 1300.0,
          "density": 25.0,
          "transmission": 0.0,
          "reflection": 0.0,
          "absorption": 1.0,
          "emissivity": 0.0,
          "temperature": 0.0,
          "constant_temperature": false,
          "texture": {
            "texture_fg": -0x1,
            "texture_bg": -0x7f7f80,
            "texture_style": 10,
            "texture_width": 8,
            "texture_height": 8
          },
          "label": "Obstacle"
        }
      ]
    }
  },
  "sensor": {
    "thermometer": {
      "x": 8.0,
      "y": 5.0
    }
  },
  "view": {
    "grid_size": 10,
    "color_palette_type": 1,
    "color_palette_x": 0.0,
    "color_palette_y": 0.0,
    "color_palette_w": 0.0,
    "color_palette_h": 0.0,
    "minimum_temperature": 0.0,
    "maximum_temperature": 40.0
  }
};