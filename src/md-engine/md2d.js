/*globals Float32Array window */
/*jslint eqnull: true, boss: true */

if (typeof window === 'undefined') window = {};

var arrays       = require('./arrays/arrays').arrays,
    constants    = require('./constants'),
    unit         = constants.unit,
    math         = require('./math'),
    coulomb      = require('./potentials').coulomb,
    makeLennardJonesCalculator = require('./potentials').makeLennardJonesCalculator,

    // TODO: Actually check for Safari. Typed arrays are faster almost everywhere
    // ... except Safari.
    notSafari = true,

    hasTypedArrays = (function() {
      try {
        new Float32Array();
      }
      catch(e) {
        return false;
      }
      return true;
    }()),

    // from A. Rahman "Correlations in the Motion of Atoms in Liquid Argon", Physical Review 136 pp. A405–A411 (1964)
    ARGON_LJ_EPSILON_IN_EV = -120 * constants.BOLTZMANN_CONSTANT.as(unit.EV_PER_KELVIN),
    ARGON_LJ_SIGMA_IN_NM   = 0.34,

    ARGON_MASS_IN_DALTON = 39.95,
    ARGON_MASS_IN_KG = constants.convert(ARGON_MASS_IN_DALTON, { from: unit.DALTON, to: unit.KILOGRAM }),

    BOLTZMANN_CONSTANT_IN_JOULES = constants.BOLTZMANN_CONSTANT.as( unit.JOULES_PER_KELVIN ),

    NODE_PROPERTIES_COUNT, INDICES,

    cross = function(a0, a1, b0, b1) {
      return a0*b1 - a1*b0;
    },

    sumSquare = function(a,b) {
      return a*a + b*b;
    },

    emptyFunction = function() {},

    /**
      Input units:
        KE: "MW Energy Units" (Dalton * nm^2 / fs^2)
      Output units:
        T: K
    */
    KE_to_T = function(internalKEinMWUnits, N) {
      // In 2 dimensions, kT = (2/N_df) * KE

      // We are using "internal coordinates" from which 1 angular and 2 translational degrees of freedom have
      // been removed

      var N_df = 2 * N - 3,
          averageKEinMWUnits = (2 / N_df) * internalKEinMWUnits,
          averageKEinJoules = constants.convert(averageKEinMWUnits, { from: unit.MW_ENERGY_UNIT, to: unit.JOULE });

      return averageKEinJoules / BOLTZMANN_CONSTANT_IN_JOULES;
    };


exports.INDICES = INDICES = {
  RADIUS :  0,
  PX     :  1,
  PY     :  2,
  X      :  3,
  Y      :  4,
  VX     :  5,
  VY     :  6,
  SPEED  :  7,
  AX     :  8,
  AY     :  9,
  MASS   : 10,
  CHARGE : 11
};

exports.NODE_PROPERTIES_COUNT = NODE_PROPERTIES_COUNT = 12;

exports.makeModel = function() {

  var // the object to be returned
      model,

      // Whether system dimensions have been set. This is only allowed to happen once.
      sizeHasBeenInitialized = false,

      // Whether "nodes" (particles) have been created & initialized. This is only allowed to happen once.
      nodesHaveBeenCreated = false,

      // Whether to simulate Coulomb forces between particles.
      useCoulombInteraction = false,

      // Whether to simulate Lennard Jones forces between particles.
      useLennardJonesInteraction = true,

      // Whether to use the thermostat to maintain the system temperature near T_target.
      useThermostat = false,

      // Whether a transient temperature change is in progress.
      temperatureChangeInProgress = false,

      // Whether to immediately break out of the integration loop when the target temperature is reached.
      breakOnTargetTemperature = false,

      // Desired system temperature, in Kelvin.
      T_target = 100,

      // Coupling factor for Berendsen thermostat. In theory, 1 = "perfectly" constrained temperature.
      thermostatCouplingFactor = 0.1,

      // Tolerance for (T_actual - T_target) relative to T_target
      tempTolerance = 0.001,

      // System dimensions as [x, y] in nanometers. Default value can be changed until particles are created.
      size = [10, 10],

      // Wall locations in nm
      topwall, rightwall, bottomwall, leftwall,

      // The current model time, in femtoseconds.
      time = 0,

      // The current integration time step, in femtoseconds.
      dt,

      // Square of integration time step, in fs^2.
      dt_sq,

      // The number of molecules in the system.
      N,

      // Total mass of all particles in the system, in Dalton (atomic mass units).
      totalMass,

      // Individual property arrays for the particles. Each is a length-N array.
      radius, px, py, x, y, vx, vy, speed, ax, ay, mass, charge,

      // An array of length NODE_PROPERTIES_COUNT which containes the above length-N arrays.
      nodes,

      // The location of the center of mass, in nanometers.
      x_CM, y_CM,

      // Linear momentum of the system, in Dalton * nm / fs.
      px_CM, py_CM,

      // Velocity of the center of mass, in nm / fs.
      vx_CM, vy_CM,

      // Angular momentum of the system wrt its center of mass
      L_CM,

      // (Instantaneous) moment of inertia of the system wrt its center of mass
      I_CM,

      // Angular velocity of the system about the center of mass, in radians / fs.
      // (= angular momentum about CM / instantaneous moment of inertia about CM)
      omega_CM,

      // instantaneous system temperature, in Kelvin
      T,

      // Object containing observations of the sytem (temperature, etc)
      outputState = window.state = {},

      // Cutoff distance beyond which the Lennard-Jones force is clipped to 0.
      cutoffDistance_LJ,

      // Square of cutoff distance; this is a convenience for updatePairwiseAccelerations
      cutoffDistance_LJ_sq,

      // Callback that recalculates cutoffDistance_LJ when the Lennard-Jones sigma parameter changes.
      ljCoefficientsChanged = function(coefficients) {
        cutoffDistance_LJ = coefficients.rmin * 5;
        cutoffDistance_LJ_sq = cutoffDistance_LJ * cutoffDistance_LJ;
      },

      // An object that calculates the magnitude of the Lennard-Jones force or potential at a given distance.
      lennardJones = window.lennardJones = makeLennardJonesCalculator({
        epsilon: ARGON_LJ_EPSILON_IN_EV,
        sigma:   ARGON_LJ_SIGMA_IN_NM
      }, ljCoefficientsChanged),

      // Function that accepts a value T and returns an average of the last n values of T (for some n).
      T_windowed,

      // Dynamically determine an appropriate window size for use when measuring a windowed average of the temperature.
      getWindowSize = function() {
        return useCoulombInteraction ? 1000 : 1000;
      },

      // If the thermostat is not being used, begins transiently adjusting the system temperature; this turns the
      // thermostat on (nudging the temperature toward T_target) until a windowed average of the temperature comes
      // within `tempTolerance` of `T_target`.
      beginTransientTemperatureChange = function()  {
        if (!useThermostat) {
          temperatureChangeInProgress = true;
          T_windowed = math.getWindowedAverager( getWindowSize() );
        }
      },

      // Calculates & returns instantaneous temperature of the system. If we're using "internal" coordinates (i.e.,
      // subtracting the center of mass translation and rotation from particle velocities), convert to internal coords
      // before calling this.
      calculateTemperature = function() {
        var twoKE_internal = 0,
            i;

        for (i = 0; i < N; i++) {
          twoKE_internal += mass[i] * (vx[i] * vx[i] + vy[i] * vy[i]);
        }
        return KE_to_T( twoKE_internal/2, N );
      },

      // Scales the velocity vector of particle i by `factor`.
      scaleVelocity = function(i, factor) {
        vx[i] *= factor;
        vy[i] *= factor;
      },

      // Adds the velocity vector (vx_t, vy_t) to the velocity vector of particle i
      addVelocity = function(i, vx_t, vy_t) {
        vx[i] += vx_t;
        vy[i] += vy_t;
      },

      // Adds effect of angular velocity omega, relative to (x_CM, y_CM), to the velocity vector of particle i
      addAngularVelocity = function(i, omega) {
        vx[i] -= omega * (y[i] - y_CM);
        vy[i] += omega * (x[i] - x_CM);
      },

      // Adds the center-of-mass linear velocity and the system angular velocity back into the velocity vector of
      // particle i.
      convertVelocityToRealCoordinates = function(i) {
        addVelocity(i, vx_CM, vy_CM);
        addAngularVelocity(i, omega_CM);
      },

      // Subtracts the center-of-mass linear velocity and the system angular velocity from the velocity vector of
      // particle i.
      convertVelocityToInternalCoordinates = function(i) {
        addVelocity(i, -vx_CM, -vy_CM);
        addAngularVelocity(i, -omega_CM);
      },

      convertAllVelocitiesToRealCoordinates = function() {
        for (var i = 0; i < N; i++) {
          convertVelocityToRealCoordinates(i);
        }
      },

      convertAllVelocitiesToInternalCoordinates = function() {
        for (var i = 0; i < N; i++) {
          convertVelocityToInternalCoordinates(i);
        }
      },

      // Subroutine that calculates the position and velocity of the center of mass, leaving these in x_CM, y_CM,
      // vx_CM, and vy_CM, and that then computes the system angular velocity around the center of mass, leaving it
      // in omega_CM.
      computeSystemTranslation = function() {
        var x_sum = 0,
            y_sum = 0,
            px_sum = 0,
            py_sum = 0,
            i;

        for (i = 0; i < N; i++) {
          x_sum += x[i];
          y_sum += y[i];
          px_sum += px[i];
          py_sum += py[i];
        }

        x_CM = x_sum / N;
        y_CM = y_sum / N;
        px_CM = px_sum;
        py_CM = py_sum;
        vx_CM = px_sum / totalMass;
        vy_CM = py_sum / totalMass;
      },

      // Subroutine that calculates the angular momentum and moment of inertia around the center of mass, and then
      // uses these to calculate the weighted angular velocity around the center of mass.
      // Updates I_CM, L_CM, and omega_CM.
      // Requires x_CM, y_CM, vx_CM, vy_CM to have been calculated.
      computeSystemRotation = function() {
        var L = 0,
            I = 0,
            i;

        for (i = 0; i < N; i++) {
          // L_CM = sum over N of of mr_i x p_i (where r_i and p_i are position & momentum vectors relative to the CM)
          L += mass[i] * cross( x[i]-x_CM, y[i]-y_CM, vx[i]-vx_CM, vy[i]-vy_CM);
          I += mass[i] * sumSquare( x[i]-x_CM, y[i]-y_CM );
        }

        L_CM = L;
        I_CM = I;
        omega_CM = L_CM / I_CM;
      },

      computeCMMotion = function() {
        computeSystemTranslation();
        computeSystemRotation();
      },

      // Calculate x(t+dt, i) from v(t) and a(t)
      updatePosition = function(i) {
        x[i] += vx[i]*dt + 0.5*ax[i]*dt_sq;
        y[i] += vy[i]*dt + 0.5*ay[i]*dt_sq;
      },

      // Constrain particle i to the area between the walls by simulating perfectly elastic collisions with the walls.
      // Note this may change the linear and angular momentum.
      bounceOffWalls = function(i) {
        // Bounce off vertical walls.
        if (x[i] < leftwall) {
          x[i]  = leftwall + (leftwall - x[i]);
          vx[i] *= -1;
        } else if (x[i] > rightwall) {
          x[i]  = rightwall - (x[i] - rightwall);
          vx[i] *= -1;
        }

        // Bounce off horizontal walls
        if (y[i] < bottomwall) {
          y[i]  = bottomwall + (bottomwall - y[i]);
          vy[i] *= -1;
        } else if (y[i] > topwall) {
          y[i]  = topwall - (y[i] - topwall);
          vy[i] *= -1;
        }
      },

      // Half of the update of v(t+dt, i) and p(t+dt, i) using a; during a single integration loop,
      // call once when a = a(t) and once when a = a(t+dt)
      halfUpdateVelocityFromAcceleration = function(i) {
        vx[i] += 0.5*ax[i]*dt;
        px[i] = mass[i] * vx[i];
        vy[i] += 0.5*ay[i]*dt;
        py[i] = mass[i] * vy[i];
      },

      // Accumulate accelerations into a(t+dt, i) and a(t+dt, j) for all pairwise interactions between particles i and j
      // where j < i. Note a(t, i) and a(t, j) (accelerations from the previous time step) should be cleared from arrays
      // ax and ay before calling this function.
      updatePairwiseAccelerations = function(i) {
        var j, dx, dy, r_sq, f_over_r, aPair_over_r, aPair_x, aPair_y, mass_inv = 1/mass[i], q_i = charge[i];

        for (j = 0; j < i; j++) {
          dx = x[j] - x[i];
          dy = y[j] - y[i];
          r_sq = dx*dx + dy*dy;

          f_over_r = 0;

          if (useLennardJonesInteraction && r_sq < cutoffDistance_LJ_sq) {
            f_over_r += lennardJones.forceOverDistanceFromSquaredDistance(r_sq);
          }

          if (useCoulombInteraction) {
            f_over_r += coulomb.forceOverDistanceFromSquaredDistance(r_sq, q_i, charge[j]);
          }

          if (f_over_r) {
            aPair_over_r = f_over_r * mass_inv;
            aPair_x = aPair_over_r * dx;
            aPair_y = aPair_over_r * dy;

            ax[i] += aPair_x;
            ay[i] += aPair_y;
            ax[j] -= aPair_x;
            ay[j] -= aPair_y;
          }
        }
      };


  return model = {

    outputState: outputState,

    useCoulombInteraction: function(v) {
      if (v !== useCoulombInteraction) {
        useCoulombInteraction = v;
        beginTransientTemperatureChange();
      }
    },

    useLennardJonesInteraction: function(v) {
      if (v !== useLennardJonesInteraction) {
        useLennardJonesInteraction = v;
        if (useLennardJonesInteraction) {
          beginTransientTemperatureChange();
        }
      }
    },

    useThermostat: function(v) {
      useThermostat = v;
    },

    setTargetTemperature: function(v) {
      if (v !== T_target) {
        T_target = v;
        beginTransientTemperatureChange();
      }
      T_target = v;
    },

    setSize: function(v) {
      // NB. We may want to create a simple state diagram for the md engine (as well as for the 'modeler' defined in
      // lab.molecules.js)
      if (sizeHasBeenInitialized) {
        throw new Error("The molecular model's size has already been set, and cannot be reset.");
      }
      size = [v[0], v[1]];
    },

    getSize: function() {
      return [size[0], size[1]];
    },

    setLJEpsilon: function(e) {
      lennardJones.setEpsilon(e);
    },

    getLJEpsilon: function() {
      return lennardJones.coefficients().epsilon;
    },

    setLJSigma: function(s) {
      lennardJones.setSigma(s);
    },

    getLJSigma: function() {
      return lennardJones.coefficients().sigma;
    },

    getLJCalculator: function() {
      return lennardJones;
    },

    createNodes: function(options) {

      if (nodesHaveBeenCreated) {
        throw new Error("md2d: createNodes was called even though the particles have already been created for this model instance.");
      }
      nodesHaveBeenCreated = true;
      sizeHasBeenInitialized = true;

      options = options || {};
      N = options.num || 50;

      var temperature = options.temperature || 100,
          rmin = lennardJones.coefficients().rmin,

          // special-case:
          arrayType = (hasTypedArrays && notSafari) ? 'Float32Array' : 'regular',

          k_inJoulesPerKelvin = constants.BOLTZMANN_CONSTANT.as(unit.JOULES_PER_KELVIN),

          mass_in_kg, v0_MKS, v0,

          nrows = Math.floor(Math.sqrt(N)),
          ncols = Math.ceil(N/nrows),

          i, r, c, rowSpacing, colSpacing,
          vMagnitude, vDirection;

      nodes  = model.nodes   = arrays.create(NODE_PROPERTIES_COUNT, null, 'regular');

      radius = model.radius = nodes[INDICES.RADIUS] = arrays.create(N, 0.5 * rmin, arrayType );
      px     = model.px     = nodes[INDICES.PX]     = arrays.create(N, 0, arrayType);
      py     = model.py     = nodes[INDICES.PY]     = arrays.create(N, 0, arrayType);
      x      = model.x      = nodes[INDICES.X]      = arrays.create(N, 0, arrayType);
      y      = model.y      = nodes[INDICES.Y]      = arrays.create(N, 0, arrayType);
      vx     = model.vx     = nodes[INDICES.VX]     = arrays.create(N, 0, arrayType);
      vy     = model.vy     = nodes[INDICES.VY]     = arrays.create(N, 0, arrayType);
      speed  = model.speed  = nodes[INDICES.SPEED]  = arrays.create(N, 0, arrayType);
      ax     = model.ax     = nodes[INDICES.AX]     = arrays.create(N, 0, arrayType);
      ay     = model.ay     = nodes[INDICES.AY]     = arrays.create(N, 0, arrayType);
      mass   = model.mass   = nodes[INDICES.MASS]   = arrays.create(N, ARGON_MASS_IN_DALTON, arrayType);
      charge = model.charge = nodes[INDICES.CHARGE] = arrays.create(N, 0, arrayType);

      totalMass = model.totalMass = N * ARGON_MASS_IN_DALTON;

      colSpacing = size[0] / (1+ncols);
      rowSpacing = size[1] / (1+nrows);

      // Arrange molecules in a lattice. Not guaranteed to have CM exactly on center, and is an artificially low-energy
      // configuration. But it works OK for now.
      i = -1;

      for (r = 1; r <= nrows; r++) {
        for (c = 1; c <= ncols; c++) {
          i++;
          if (i === N) break;

          x[i] = c*colSpacing;
          y[i] = r*rowSpacing;

          // Randomize velocities, exactly balancing the motion of the center of mass by making the second half of the
          // set of atoms have the opposite velocities of the first half. (If the atom number is odd, the "odd atom out"
          // should have 0 velocity).
          //
          // Note that although the instantaneous temperature will be 'temperature' exactly, the temperature will quickly
          // settle to a lower value because we are initializing the atoms spaced far apart, in an artificially low-energy
          // configuration.

          if (i < Math.floor(N/2)) {      // 'middle' atom will have 0 velocity

            // Note kT = m<v^2>/2 because there are 2 degrees of freedom per atom, not 3
            // TODO: define constants to avoid unnecesssary conversions below.

            mass_in_kg = constants.convert(mass[i], { from: unit.DALTON, to: unit.KILOGRAM });
            v0_MKS = Math.sqrt(2 * k_inJoulesPerKelvin * temperature / mass_in_kg);
            // FIXME: why does this velocity need a sqrt(2)/10 correction?
            // (no, not because of potentials...)
            v0 = constants.convert(v0_MKS, { from: unit.METERS_PER_SECOND, to: unit.MW_VELOCITY_UNIT });

            vMagnitude = math.normal(v0, v0/4);
            vDirection = 2 * Math.random() * Math.PI;
            vx[i] = vMagnitude * Math.cos(vDirection);
            px[i] = mass[i] * vx[i];
            vy[i] = vMagnitude * Math.sin(vDirection);
            py[i] = mass[i] * vy[i];

            vx[N-i-1] = -vx[i];
            px[N-i-1] = mass[N-i-1] * vx[N-i-1];
            vy[N-i-1] = -vy[i];
            py[N-i-1] = mass[N-i-1] * vy[N-i-1];
          }

          ax[i] = 0;
          ay[i] = 0;

          speed[i]  = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
          charge[i] = 2*(i%2)-1;      // alternate negative and positive charges
        }
      }

      // Compute linear and angular velocity of CM, compute temperature, and publish output state:
      computeCMMotion();

      convertAllVelocitiesToInternalCoordinates();
      T = calculateTemperature();
      convertAllVelocitiesToRealCoordinates();

      model.computeOutputState();
    },


    relaxToTemperature: function(T) {
      if (T != null) T_target = T;

      beginTransientTemperatureChange();
      breakOnTargetTemperature = true;
      while (temperatureChangeInProgress) {
        this.integrate();
      }
      breakOnTargetTemperature = false;
    },


    integrate: function(duration, opt_dt) {

      if (!nodesHaveBeenCreated) {
        throw new Error("md2d: integrate called before nodes created.");
      }

      // FIXME. Recommended timestep for accurate simulation is τ/200
      // using rescaled t where t → τ(mσ²/ϵ)^½  (~= 1 ps for argon)
      // This is hardcoded below for the "Argon" case by setting dt = 5 fs:

      if (duration == null)  duration = 250;  // how much time to integrate over, in fs

      dt = opt_dt || 5;
      dt_sq = dt*dt;                      // time step, squared

      leftwall   = radius[0];
      bottomwall = radius[0];
      rightwall  = size[0] - radius[0];
      topwall    = size[1] - radius[0];

      var t_start = time,
          n_steps = Math.floor(duration/dt),  // number of steps
          iloop,
          i,
          rescalingFactor, // rescaling factor for Berendsen thermostat
          rescalingFunc,
          updateAccelerationsFunc = emptyFunction;

      // We'll just skip right over updating pairwise accelerations if LJ and Coulomb forces are off
      if (useLennardJonesInteraction || useCoulombInteraction) {
        updateAccelerationsFunc = updatePairwiseAccelerations;
      }

      // Velocities are always in 'real' coodinates when entering or exiting the integrate() function.
      convertAllVelocitiesToInternalCoordinates();

      for (iloop = 1; iloop <= n_steps; iloop++) {
        time = t_start + iloop*dt;

        if (temperatureChangeInProgress && Math.abs(T_windowed(T) - T_target) <= T_target * tempTolerance) {
          temperatureChangeInProgress = false;
          if (breakOnTargetTemperature) break;
        }

        // rescale velocities based on ratio of target temp to measured temp (Berendsen thermostat)
        if (temperatureChangeInProgress || useThermostat && T > 0) {
          rescalingFunc = scaleVelocity;
          rescalingFactor = Math.sqrt(1 + thermostatCouplingFactor * (T_target / T - 1));
        }
        else {
          rescalingFunc = emptyFunction;
        }

        for (i = 0; i < N; i++) {
          // Rescale "internal" velocities to match the desired temperature; i.e., don't scale the overall system
          // rotation and translation when adjusting temperature.
          rescalingFunc(i, rescalingFactor);

          // Convert velocities from "internal" to "real" velocities before calculating x, y and updating px, py
          convertVelocityToRealCoordinates(i);

          // Update r(t+dt) using v(t) and a(t)
          updatePosition(i);
          bounceOffWalls(i);

          // First half of update of v(t+dt, i), using v(t, i) and a(t, i)
          halfUpdateVelocityFromAcceleration(i);

          // Zero out a(t, i) for accumulation of a(t+dt, i)
          ax[i] = ay[i] = 0;

          // Accumulate accelerations for time t+dt into a(t+dt, k) for k <= i. Note that a(t+dt, i) won't be
          // usable until this loop completes; it won't have contributions from a(t+dt, k) for k > i
          updateAccelerationsFunc(i);
        }

        for (i = 0; i < N; i++) {
          // Second half of update of v(t+dt, i) using first half of update and a(t+dt, i)
          halfUpdateVelocityFromAcceleration(i);

          // Now that we have velocity, update speed
          speed[i] = Math.sqrt(vx[i]*vx[i] + vy[i]*vy[i]);
        }

        // Update CM(t+dt), p_CM(t+dt), v_CM(t+dt), omega_CM(t+dt)
        computeCMMotion();

        convertAllVelocitiesToInternalCoordinates();

        T = calculateTemperature();
      } // end of integration loop

      // convert to real coordinates before leaving integrate()
      convertAllVelocitiesToRealCoordinates();

      model.computeOutputState();
    },

    computeOutputState: function() {
      var i, j,
          dx, dy,
          r_sq,
          realKEinMWUnits,   // KE in "real" coordinates, in MW Units
          PE;                // potential energy, in eV

      // Calculate potentials in eV. Note that we only want to do this once per call to integrate(), not once per
      // integration loop!
      PE = 0;
      realKEinMWUnits= 0;

      for (i = 0; i < N; i++) {
        realKEinMWUnits += 0.5 * mass[i] * (vx[i] * vx[i] + vy[i] * vy[i]);
        for (j = i+1; j < N; j++) {
          dx = x[j] - x[i];
          dy = y[j] - y[i];

          r_sq = dx*dx + dy*dy;

          // report total potentials as POSITIVE, i.e., - the value returned by potential calculators
          if (useLennardJonesInteraction ) {
            PE += -lennardJones.potentialFromSquaredDistance(r_sq);
          }
          if (useCoulombInteraction) {
            PE += -coulomb.potential(Math.sqrt(r_sq), charge[i], charge[j]);
          }
        }
      }

      // State to be read by the rest of the system:
      outputState.time     = time;
      outputState.pressure = 0;// (time - t_start > 0) ? pressure / (time - t_start) : 0;
      outputState.PE       = PE;
      outputState.KE       = constants.convert(realKEinMWUnits, { from: unit.MW_ENERGY_UNIT, to: unit.EV });
      outputState.T        = T;
      outputState.pCM      = [px_CM, py_CM];
      outputState.CM       = [x_CM, y_CM];
      outputState.vCM      = [vx_CM, vy_CM];
      outputState.omega_CM = omega_CM;
    }
  };
};