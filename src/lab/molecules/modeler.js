/*globals modeler:true, d3, arrays, molecules_coulomb, molecules_lennard_jones, benchmark */
/*jslint onevar: true devel:true eqnull: true */

// modeler.js
//

modeler = {};
modeler.VERSION = '0.1.0';

modeler.math = modeler.math || {};

// Simple (Box-Muller) univariate-normal random number generator.
//
// The 'science.js' library includes a Box-Muller implementation which is likely to be slower, especially in a
// modern Javascript engine, because it uses a rejection method to pick the random point in the unit circle.
// See discussion on pp. 1-3 of:
// http://www.math.nyu.edu/faculty/goodman/teaching/MonteCarlo2005/notes/GaussianSampling.pdf
//
modeler.math.normal = (function() {
  var next = null;

  return function(mean, sd) {
    if (mean == null) mean = 0;
    if (sd == null)   sd = 1;

    var r, ret, theta, u1, u2;

    if (next) {
      ret  = next;
      next = null;
      return ret;
    }

    u1    = Math.random();
    u2    = Math.random();
    theta = 2 * Math.PI * u1;
    r     = Math.sqrt(-2 * Math.log(u2));

    next = mean + sd * (r * Math.sin(theta));
    return mean + sd * (r * Math.cos(theta));
  };
}());

modeler.makeIntegrator = function(args) {

  var setOnceState   = args.setOnceState,
      readWriteState = args.readWriteState,
      settableState  = args.settableState || {},

      outputState    = args.outputState,

      max_coulomb_distance = setOnceState.max_coulomb_distance,
      max_ljf_distance     = setOnceState.max_ljf_distance,
      size                 = setOnceState.size,

      ax                   = readWriteState.ax,
      ay                   = readWriteState.ay,
      charge               = readWriteState.charge,
      nodes                = readWriteState.nodes,
      px                   = readWriteState.px,
      py                   = readWriteState.py,
      radius               = readWriteState.radius,
      speed                = readWriteState.speed,
      vx                   = readWriteState.vx,
      vy                   = readWriteState.vy,
      x                    = readWriteState.x,
      y                    = readWriteState.y,

      useCoulombInteraction      = settableState.useCoulombInteraction,
      useLennardJonesInteraction = settableState.useLennardJonesInteraction,
      useThermostat              = settableState.useThermostat,

      // Set to true when a temperature change is requested, reset to false when system approaches temperature
      temperatureChangeInProgress = false,

      twoKE = (function() {
        var twoKE = 0, i, n = nodes.length;
        for (i = 0; i < n; i++) {
          twoKE += speed[i]*speed[i];
        }
        return twoKE;
      }()),

      // Desired temperature. We will simulate coupling to an infinitely large heat bath at desired
      // temperature T_target.
      T_target = 1.0,

      // Coupling factor for Berendsen thermostat.
      dt_over_tau = 0.01,

      // Tolerance for (T_actual - T_target) relative to T_target
      tempTolerance = 0.01;

  return {

    useCoulombInteraction      : function(v) { useCoulombInteraction = v; },
    useLennardJonesInteraction : function(v) { useLennardJonesInteraction = v; },
    useThermostat              : function(v) { useThermostat = v; },
    setTargetTemperature       : function(v) {
      if (v !== T_target) temperatureChangeInProgress = true;
      T_target = v;
    },

    integrate: function(t, dt) {

      if (t == null)  t = 1;         // how much "time" to integrate over
      if (dt == null) dt = 1/50;     // time step

      var integration_steps = t/dt,       // number of steps
          dt_sq             = dt*dt,      // time step, squared
          n = nodes[0].length,            // number of particles
          i,
          j,
          r,
          dr_sq, v_sq, r_sq,
          f, f_lj, f_coul, fx, fy,        // pairwise forces and their x, y components
          dx, dy,
          x_initial, y_initial,
          iloop,
          leftwall   = radius[0],
          bottomwall = radius[0],
          rightwall  = size[0] - radius[0],
          topwall    = size[1] - radius[0],

          PE,                             // potential energy
          T,                              // temperature
          vRescalingFactor,               // rescaling factor for Berendsen thermostat

          // measurements to be accumulated during the integration loop:
          pressure = 0;

      //
      // Loop through this inner processing loop 'integration_steps' times:
      //
      for (iloop = 0; iloop < integration_steps; iloop++) {

        // Measure the temperature and set the velocity-rescaling factor based on the temperature:
        T = twoKE / 2 / n;

        if (temperatureChangeInProgress && Math.abs(T - T_target) <= T_target * tempTolerance) {
          temperatureChangeInProgress = false;
        }

        vRescalingFactor = 1;
        if (temperatureChangeInProgress || useThermostat && T > 0) {
          vRescalingFactor = 1 + dt_over_tau * ((T_target / T) - 1);
        }

        // Initialize sums such as 'twoKE' which need be accumulated once per integration loop:
        twoKE = 0;

        //
        // Use velocity Verlet integration to continue particle movement integrating acceleration with
        // existing position and previous position while managing collision with boundaries.
        //
        // Update positions for first half of verlet integration
        //
        for (i = 0; i < n; i++) {
          x_initial = x[i];
          y_initial = y[i];

          // Rescale v(t) using T(t)
          if (vRescalingFactor !== 1) {
            vx[i] *= vRescalingFactor;
            vy[i] *= vRescalingFactor;
          }

          // calculate x(t+dt) from v(t) and a(t)
          x[i] += vx[i]*dt + 0.5*ax[i]*dt_sq;
          y[i] += vy[i]*dt + 0.5*ay[i]*dt_sq;

          dx = x[i] - x_initial;
          dy = y[i] - y_initial;

          dr_sq = dx*dx + dy*dy;
          v_sq  = dr_sq / dt_sq;
          speed[i] = Math.sqrt(v_sq);

          twoKE += v_sq;

          // FIRST HALF of calculation of v(t+dt):  v1(t+dt) <- v(t) + 0.5*a(t)*dt;
          vx[i] += 0.5*ax[i]*dt;
          vy[i] += 0.5*ay[i]*dt;

          // Bounce off vertical walls
          if (x[i] < leftwall) {
            x[i]  = leftwall + (leftwall - x[i]);
            px[i] = x[i] + dx;
            vx[i] *= -1;
            pressure += -dx/dt;
          } else if (x[i] > rightwall) {
            x[i]  = rightwall + (rightwall - x[i]);
            px[i] = x[i] + dx;
            vx[i] *= -1;
            pressure += dx/dt;
          } else {
            px[i] = x_initial;
          }

          // Bounce off horizontal walls
          if (y[i] < bottomwall) {
            y[i]  = bottomwall + (bottomwall - y[i]);
            py[i] = y[i] + dy;
            vy[i] *= -1;
            pressure += -dy/dt;
          } else if (y[i] > topwall) {
            y[i]  = topwall + (topwall - y[i]);
            py[i] = y[i] + dy;
            vy[i] *= -1;
            pressure += dy/dt;
          } else {
            py[i] = y_initial;
          }
        }

        // Calculate a(t+dt), step 1: Zero out the acceleration, in order to accumulate pairwise interactions.
        for (i = 0; i < n; i++) {
          ax[i] = 0;
          ay[i] = 0;
        }

        // Calculate a(t+dt), step 2: Sum over all pairwise interactions.
        if (useLennardJonesInteraction || useCoulombInteraction) {
          for (i = 0; i < n; i++) {
            for (j = i+1; j < n; j++) {
              dx = x[j] - x[i];
              dy = y[j] - y[i];

              r_sq = dx*dx + dy*dy;
              r = Math.sqrt(r_sq);

              f_lj = 0;
              f_coul = 0;

              if (useLennardJonesInteraction && r < max_ljf_distance) {
                f_lj = molecules_lennard_jones.force(r);
              }
              if (useCoulombInteraction && r < max_coulomb_distance) {
                f_coul = molecules_coulomb.force(r, charge[i], charge[j]);
              }

              f  = f_lj + f_coul;
              fx = f * (dx / r);
              fy = f * (dy / r);

              ax[i] += fx;
              ay[i] += fy;
              ax[j] -= fx;
              ay[j] -= fy;
            }
          }
        }

        // SECOND HALF of calculation of v(t+dt): v(t+dt) <- v1(t+dt) + 0.5*a(t+dt)*dt
        for (i = 0; i < n; i++) {
          vx[i] += 0.5*ax[i]*dt;
          vy[i] += 0.5*ay[i]*dt;
        }
      }

      // Calculate potentials. Note that we only want to do this once per call to integrate(), not once per
      // integration loop!
      PE = 0;

      for (i = 0; i < n; i++) {
        for (j = i+1; j < n; j++) {
          dx = x[j] - x[i];
          dy = y[j] - y[i];

          r_sq = dx*dx + dy*dy;
          r = Math.sqrt(r_sq);

          if (useLennardJonesInteraction && r < max_ljf_distance) {
            PE += molecules_lennard_jones.potential(r);
          }
          if (useCoulombInteraction && r < max_coulomb_distance) {
            PE += molecules_coulomb.potential(r, charge[i], charge[j]);
          }
        }
      }

      // State to be read by the rest of the system:
      outputState.pressure = pressure / integration_steps;
      outputState.PE = PE;
      outputState.KE = twoKE / 2;
      outputState.T = T;
    }
  };
};


modeler.model = function() {
  var model = {},
      atoms = [],
      mol_number,
      event = d3.dispatch("tick"),
      size = [100, 100],
      temperature_control,
      lennard_jones_forces, coulomb_forces,
      pe,
      ke,
      stopped = true,
      tick_history_list = [],
      tick_history_list_index = 0,
      tick_counter = 0,
      new_step = false,
      epsilon, sigma,
      max_ljf_repulsion = -200.0,
      min_ljf_attraction = 0.001,
      max_ljf_distance,
      min_ljf_distance,
      max_coulomb_force = 20.0,
      min_coulomb_force = 0.01,
      max_coulomb_distance,
      min_coulomb_distance,
      pressure, pressures = [0],
      sample_time, sample_times = [],
      temperature,

      integrator,
      integratorOutputState = {},
      model_listener,

      //
      // Individual property arrays for the nodes
      //
      radius, px, py, x, y, vx, vy, speed, ax, ay, halfmass, charge,

      //
      // Number of individual properties for a node
      //
      node_properties_length = 12,

      //
      // A two dimensional array consisting of arrays of node property values
      //
      nodes = arrays.create(node_properties_length, null, "regular"),

      //
      // Indexes into the nodes array for the individual node property arrays
      //
      // Access to these within this module will be faster if they are vars in this closure rather than property lookups.
      // However, publish the indices to model.INDICES for use outside this module.
      //
      RADIUS_INDEX   =  0,
      PX_INDEX       =  1,
      PY_INDEX       =  2,
      X_INDEX        =  3,
      Y_INDEX        =  4,
      VX_INDEX       =  5,
      VY_INDEX       =  6,
      SPEED_INDEX    =  7,
      AX_INDEX       =  8,
      AY_INDEX       =  9,
      HALFMASS_INDEX = 10,
      CHARGE_INDEX   = 11;


  model.INDICES = {
    RADIUS   : RADIUS_INDEX,
    PX       : PX_INDEX,
    PY       : PY_INDEX,
    X        : X_INDEX,
    Y        : Y_INDEX,
    VX       : VX_INDEX,
    VY       : VY_INDEX,
    SPEED    : SPEED_INDEX,
    AX       : AX_INDEX,
    AY       : AY_INDEX,
    HALFMASS : HALFMASS_INDEX,
    CHARGE   : CHARGE_INDEX
  };


  //
  // The abstract_to_real_temperature(t) function is used to map temperatures in abstract units
  // within a range of 0..10 to the 'real' temperature <mv^2>/2k (remember there's only 2 DOF)
  //
  function abstract_to_real_temperature(t) {
    return 0.19*t + 0.1;  // Translate 0..10 to 0.1..2
  }

  function average_speed() {
    var i, s = 0, n = nodes[0].length;
    i = -1; while (++i < n) { s += speed[i]; }
    return s/n;
  }

  //
  // Calculate the minimum and maximum distances for applying lennard-jones forces
  //
  function setup_ljf_limits() {
    var i, f;
    for (i = 0; i <= 100; i+=0.001) {
      f = molecules_lennard_jones.force(i);
      if (f > max_ljf_repulsion) {
        min_ljf_distance = i;
        break;
      }
    }

    for (;i <= 100; i+=0.001) {
      f = molecules_lennard_jones.force(i);
      if (f > min_ljf_attraction) {
        break;
      }
    }

    for (;i <= 100; i+=0.001) {
      f = molecules_lennard_jones.force(i);
      if (f < min_ljf_attraction) {
        max_ljf_distance = i;
        break;
      }
    }
  }

  //
  // Calculate the minimum and maximum distances for applying coulomb forces
  //
  function setup_coulomb_limits() {
    var i, f;
    for (i = 0.001; i <= 100; i+=0.001) {
      f = molecules_coulomb.force(i, -1, 1);
      if (f < max_coulomb_force) {
        min_coulomb_distance = i;
        break;
      }
    }

    for (;i <= 100; i+=0.001) {
      f = molecules_coulomb.force(i, -1, 1);
      if (f < min_coulomb_force) {
        break;
      }
    }
    max_coulomb_distance = i;
  }

  //
  // Main Model Integration Loop
  //

  function tick_history_list_push() {
    var i,
        newnodes = [],
        n = nodes.length;

    i = -1; while (++i < n) {
      newnodes[i] = arrays.clone(nodes[i]);
    }
    tick_history_list.length = tick_history_list_index;
    tick_history_list_index++;
    tick_counter++;
    new_step = true;
    tick_history_list.push({ nodes: newnodes, ke:ke });
    if (tick_history_list_index > 1000) {
      tick_history_list.splice(0,1);
      tick_history_list_index = 1000;
    }
  }

  function tick() {
    var t;

    integrator.integrate();
    pressure = integratorOutputState.pressure;
    pe = integratorOutputState.PE;

    pressures.push(pressure);
    pressures.splice(0, pressures.length - 16); // limit the pressures array to the most recent 16 entries
    ke = integratorOutputState.KE;
    tick_history_list_push();
    if (!stopped) {
      t = Date.now();
      if (sample_time) {
        sample_time  = t - sample_time;
        if (sample_time) { sample_times.push(sample_time); }
        sample_time = t;
        sample_times.splice(0, sample_times.length - 128);
      } else {
        sample_time = t;
      }
      event.tick({type: "tick"});
    }
    return stopped;
  }

  function reset_tick_history_list() {
    tick_history_list = [];
    tick_history_list_index = 0;
    tick_counter = -1;
  }

  function tick_history_list_reset_to_ptr() {
    tick_history_list.length = tick_history_list_index + 1;
  }

  function tick_history_list_extract(index) {
    var i, n=nodes.length;
    if (index < 0) {
      throw new Error("modeler: request for tick_history_list[" + index + "]");
    }
    if (index >= tick_history_list.length) {
      throw new Error("modeler: request for tick_history_list[" + index + "], tick_history_list.length=" + tick_history_list.length);
    }
    i = -1; while(++i < n) {
      arrays.copy(tick_history_list[index].nodes[i], nodes[i]);
    }
    ke = tick_history_list[index].ke;
  }

  function container_pressure() {
    return pressures.reduce(function(j,k) { return j+k; })/pressures.length;
  }

  function speed_history(speeds) {
    if (arguments.length) {
      speed_history.push(speeds);
      // limit the pressures array to the most recent 16 entries
      speed_history.splice(0, speed_history.length - 100);
    } else {
      return speed_history.reduce(function(j,k) { return j+k; })/pressures.length;
    }
  }

  function average_rate() {
    var i, ave, s = 0, n = sample_times.length;
    i = -1; while (++i < n) { s += sample_times[i]; }
    ave = s/n;
    return (ave ? 1/ave*1000: 0);
  }

  function set_temperature(t) {
    temperature = t;
    if (integrator) integrator.setTargetTemperature(abstract_to_real_temperature(t));
  }

  // ------------------------------------------------------------
  //
  // Public functions
  //
  // ------------------------------------------------------------

  model.getStats = function() {
    return {
      speed       : average_speed(),
      ke          : ke,
      temperature : temperature,
      pressure    : container_pressure(),
      current_step: tick_counter,
      steps       : tick_history_list.length-1
    };
  };

  model.stepCounter = function() {
    return tick_counter;
  };

  model.steps = function() {
    return tick_history_list.length-1;
  };

  model.isNewStep = function() {
    return new_step;
  };

  model.seek = function(location) {
    if (!arguments.length) { location = 0; }
    stopped = true;
    new_step = false;
    tick_history_list_index = location;
    tick_counter = location;
    tick_history_list_extract(tick_history_list_index);
    return tick_counter;
  };

  model.stepBack = function(num) {
    if (!arguments.length) { num = 1; }
    var i = -1;
    stopped = true;
    new_step = false;
    while(++i < num) {
      if (tick_history_list_index > 1) {
        tick_history_list_index--;
        tick_counter--;
        tick_history_list_extract(tick_history_list_index-1);
        if (model_listener) { model_listener(); }
      }
    }
    return tick_counter;
  };

  model.stepForward = function(num) {
    if (!arguments.length) { num = 1; }
    var i = -1;
    stopped = true;
    while(++i < num) {
      if (tick_history_list_index < tick_history_list.length) {
        tick_history_list_extract(tick_history_list_index);
        tick_history_list_index++;
        tick_counter++;
        if (model_listener) { model_listener(); }
      } else {
        tick();
        if (model_listener) { model_listener(); }
      }
    }
    return tick_counter;
  };

  // The next four functions assume we're are doing this for
  // all the atoms will need to be changed when different atoms
  // can have different LJ sigma values

  model.set_lj_coefficients = function(e, s) {
    // am not using the coefficients beyond setting the ljf limits yet ...
    epsilon = e;
    sigma = s;
    molecules_lennard_jones.epsilon(e);
    molecules_lennard_jones.sigma(s);
    setup_ljf_limits();
  };

  model.getEpsilon = function() {
    return epsilon;
  };

  model.getSigma = function() {
    return sigma;
  };

  model.set_radius = function(r) {
    var i, n = nodes[0].length;
    i = -1; while(++i < n) { radius[i] = r; }
  };

  // return a copy of the array of speeds
  model.get_speed = function() {
    return arrays.copy(speed, []);
  };

  model.get_rate = function() {
    return average_rate();
  };

  model.set_temperature_control = function(tc) {
   temperature_control = tc;
   if (integrator) integrator.useThermostat(tc);
  };

  model.set_lennard_jones_forces = function(lj) {
   lennard_jones_forces = lj;
   if (integrator) integrator.useLennardJonesInteraction(lj);
  };

  model.set_coulomb_forces = function(cf) {
   coulomb_forces = cf;
   if (integrator) integrator.useCoulombInteraction(cf);
  };

  model.get_nodes = function() {
    return nodes;
  };

  model.get_atoms = function() {
    return atoms;
  };

  model.initialize = function(options) {
    options = options || {};
    var temperature;

    lennard_jones_forces = options.lennard_jones_forces || true;
    coulomb_forces       = options.coulomb_forces       || false;
    temperature_control  = options.temperature_control  || false;
    temperature          = options.temperature          || 3;

    // who is listening to model tick completions
    model_listener = options.model_listener || false;

    reset_tick_history_list();

    // setup local variables that help optimize the calculation loops
    // TODO pull this state out and pass it to the integrator
    setup_ljf_limits();
    setup_coulomb_limits();

    // pressures.push(pressure);
    // pressures.splice(0, pressures.length - 16); // limit the pressures array to the most recent 16 entries

    integrator = modeler.makeIntegrator({

      setOnceState: {
        max_coulomb_distance : max_coulomb_distance,
        max_ljf_distance     : max_ljf_distance,
        size                 : size,
        max_ljf_repulsion    : max_ljf_repulsion,
        max_coulomb_force    : max_coulomb_force
      },

      settableState: {
        useLennardJonesInteraction : lennard_jones_forces,
        useCoulombInteraction      : coulomb_forces,
        useThermostat              : temperature_control
      },

      readWriteState: {
        ax     : ax,
        ay     : ay,
        charge : charge,
        nodes  : nodes,
        px     : px,
        py     : py,
        radius : radius,
        speed  : speed,
        vx     : vx,
        vy     : vy,
        x      : x,
        y      : y
      },

      outputState: integratorOutputState
    });

    set_temperature(temperature);

    // thermalize
    integrator.useThermostat(true);
    integrator.integrate(50, 1/20);
    integrator.useThermostat(temperature_control);

    tick_history_list_push();
    return model;
  };

  model.on = function(type, listener) {
    event.on(type, listener);
    return model;
  };

  model.tickInPlace = function() {
    event.tick({type: "tick"});
    return model;
  };

  model.tick = function(num) {
    if (!arguments.length) { num = 1; }
    var i = -1;
    while(++i < num) {
      tick();
    }
    return model;
  };

  model.nodes = function(options) {
    options = options || {};

    var num                    = options.num                    || 50,
        temperature            = options.temperature            || 3,
        rmin                   = options.rmin                   || 4.4,
        mol_rmin_radius_factor = options.mol_rmin_radius_factor || 0.38,

        webgl = !!window.WebGLRenderingContext,
        not_safari = benchmark.what_browser.browser !== 'Safari',

        // special-case: Typed arrays are faster almost everywhere
        // ... except for Safari
        array_type = (webgl && not_safari) ? 'Float32Array' : 'regular',

        v0,
        i, r, c, nrows, ncols, rowSpacing, colSpacing,
        vMagnitude, vDirection;

    mol_number = num;
    atoms.length = num;

    nodes = arrays.create(node_properties_length, null, 'regular');

    // model.INDICES.RADIUS = 0
    nodes[model.INDICES.RADIUS] = arrays.create(num, rmin * mol_rmin_radius_factor, array_type );
    radius = nodes[model.INDICES.RADIUS];

    // model.INDICES.PX     = 1;
    nodes[model.INDICES.PX] = arrays.create(num, 0, array_type);
    px = nodes[model.INDICES.PX];

    // model.INDICES.PY     = 2;
    nodes[model.INDICES.PY] = arrays.create(num, 0, array_type);
    py = nodes[model.INDICES.PY];

    // model.INDICES.X      = 3;
    nodes[model.INDICES.X] = arrays.create(num, 0, array_type);
    x = nodes[model.INDICES.X];

    // model.INDICES.Y      = 4;
    nodes[model.INDICES.Y] = arrays.create(num, 0, array_type);
    y = nodes[model.INDICES.Y];

    // model.INDICES.VX     = 5;
    nodes[model.INDICES.VX] = arrays.create(num, 0, array_type);
    vx = nodes[model.INDICES.VX];

    // model.INDICES.VY     = 6;
    nodes[model.INDICES.VY] = arrays.create(num, 0, array_type);
    vy = nodes[model.INDICES.VY];

    // model.INDICES.SPEED  = 7;
    nodes[model.INDICES.SPEED] = arrays.create(num, 0, array_type);
    speed = nodes[model.INDICES.SPEED];

    // model.INDICES.AX     = 8;
    nodes[model.INDICES.AX] = arrays.create(num, 0, array_type);
    ax = nodes[model.INDICES.AX];

    // model.INDICES.AY     = 9;
    nodes[model.INDICES.AY] = arrays.create(num, 0, array_type);
    ay = nodes[model.INDICES.AY];

    // model.INDICES.HALFMASS = 10;
    nodes[model.INDICES.HALFMASS] = arrays.create(num, 0.5, array_type);
    halfmass = nodes[model.INDICES.HALFMASS];

    // model.INDICES.CHARGE   = 11;
    nodes[model.INDICES.CHARGE] = arrays.create(num, 0, array_type);
    charge = nodes[model.INDICES.CHARGE];


    // Actually arrange the atoms.
    v0 = Math.sqrt(2*abstract_to_real_temperature(temperature));

    nrows = Math.ceil(Math.sqrt(num));
    ncols = Math.ceil(num / nrows);

    colSpacing = size[0] / (1+ncols);
    rowSpacing = size[1] / (1+nrows);

    // Arrange molecules in a lattice. Not guaranteed to have CM exactly on center, and is an artificially low-energy
    // configuration. But it works OK for now.
    i = -1;
    for (r = 1; r <= nrows; r++) {
      for (c = 1; c <= ncols; c++) {
        i++;
        x[i] = c*colSpacing;
        y[i] = r*rowSpacing;

        // Randomize velocities, exactly balancing the motion of the center of mass by making the second half of the
        // set of atoms have the opposite velocities of the first half. (If the atom number is odd, the "odd atom out"
        // should have 0 velocity).
        //
        // Note that although the instantaneous temperature will be 'temperature' exactly, the temperature will quickly
        // settle to a lower value because we are initializing the atoms spaced far apart, in an artificially low-energy
        // configuration.

        if (i < Math.floor(num/2)) {      // 'middle' atom will have 0 velocity
          vMagnitude = modeler.math.normal(v0, v0/4);
          vDirection = 2 * Math.random() * Math.PI;
          vx[i] = vMagnitude * Math.cos(vDirection);
          vy[i] = vMagnitude * Math.sin(vDirection);
          vx[num-i] = -vx[i];
          vy[num-i] = -vy[i];
        }

        ax[i] = 0;
        ay[i] = 0;

        speed[i]  = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
        charge[i] = 2*(i%2)-1;      // alternate negative and positive charges
      }
    }

    return model;
  };

  model.start = function() {
    model.initialize();
    return model.resume();
  };

  model.resume = function() {
    stopped = false;
    d3.timer(tick);
    return model;
  };

  model.stop = function() {
    stopped = true;
    return model;
  };

  model.ke = function() {
    return integratorOutputState ? integratorOutputState.KE : undefined;
  };

  model.ave_ke = function() {
    return integratorOutputState? integratorOutputState.KE / nodes[0].length : undefined;
  };

  model.pe = function() {
    return integratorOutputState ? integratorOutputState.PE : undefined;
  };

  model.ave_pe = function() {
    return integratorOutputState? integratorOutputState.PE / nodes[0].length : undefined;
  };

  model.speed = function() {
    return average_speed();
  };

  model.pressure = function() {
    return container_pressure();
  };

  model.temperature = function(x) {
    if (!arguments.length) return temperature;
    set_temperature(x);
    return model;
  };

  model.size = function(x) {
    if (!arguments.length) return size;
    size = x;
    return model;
  };

  return model;
};
