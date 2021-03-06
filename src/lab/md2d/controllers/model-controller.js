/*global

  define
  DEVELOPMENT
  d3
  alert
  model: true
  model_player: true
*/
/*jslint onevar: true*/
define(function (require) {
  // Dependencies.
  var Model             = require('md2d/models/modeler'),
      MoleculeContainer = require('md2d/views/molecule-container'),
      ModelPlayer       = require('cs!common/components/model_player');

  return function modelController(moleculeViewId, modelConfig, playerConfig) {
    var controller = {},

        // event dispatcher
        dispatch = d3.dispatch('modelReset'),

        // properties read from the playerConfig hash
        controlButtons,
        modelTimeLabel,
        fit_to_parent,
        enableAtomTooltips,

        // properties read from the modelConfig hash
        elements,
        atoms,
        mol_number,
        temperature_control,
        temperature,
        width,
        height,
        keShading,
        chargeShading,
        showVDWLines,
        radialBonds,
        angularBonds,
        obstacles,
        viscosity,
        gravitationalField,
        images,
        textBoxes,
        interactiveUrl,
        showClock,
        viewRefreshInterval,
        timeStep,

        moleculeContainer,

        // We pass this object to the "ModelPlayer" to intercept messages for the model
        // instead of allowing the ModelPlayer to talk to the model directly.
        // This allows us, for example, to reload the model instead of trying to call a 'reset' event
        // on models which don't know how to reset themselves.

        modelProxy = {
          resume: function() {
            model.resume();
          },

          stop: function() {
            model.stop();
          },

          reset: function() {
            model.stop();
            // if the model has a reset function then call it so anything the application
            // sets up outside the interactive itself that is listening for a model.reset
            // event gets notified. Example the Energy Graph Extra Item.
            if (model.reset) {
              model.reset();
            }
            reload(modelConfig, playerConfig);
          },

          is_stopped: function() {
            return model.is_stopped();
          }
        };

      // ------------------------------------------------------------
      //
      // Main callback from model process
      //
      // Pass this function to be called by the model on every model step
      //
      // ------------------------------------------------------------
      function tickHandler() {
        moleculeContainer.update_drawable_positions();
      }


      // ------------------------------------------------------------
      //
      // Initialize (or update) local variables based on playerConfig and modelConfig objects
      //
      // ------------------------------------------------------------

      function initializeLocalVariables() {
        controlButtons      = playerConfig.controlButtons;
        modelTimeLabel      = playerConfig.modelTimeLabel;
        enableAtomTooltips  = playerConfig.enableAtomTooltips || false;
        fit_to_parent       = playerConfig.fit_to_parent;
        interactiveUrl      = playerConfig.interactiveUrl;

        elements            = modelConfig.elements;
        atoms               = modelConfig.atoms;
        mol_number          = modelConfig.mol_number;
        temperature_control = modelConfig.temperature_control;
        temperature         = modelConfig.temperature;
        width               = modelConfig.width;
        height              = modelConfig.height;
        keShading           = modelConfig.keShading;
        chargeShading       = modelConfig.chargeShading;
        showVDWLines        = modelConfig.showVDWLines;
        showClock           = modelConfig.showClock;
        viewRefreshInterval = modelConfig.viewRefreshInterval;
        timeStep            = modelConfig.timeStep;
        radialBonds         = modelConfig.radialBonds;
        angularBonds        = modelConfig.angularBonds;
        obstacles           = modelConfig.obstacles;
        viscosity           = modelConfig.viscosity;
        gravitationalField  = modelConfig.gravitationalField;
        images              = modelConfig.images;
        textBoxes           = modelConfig.textBoxes;
      }

      // ------------------------------------------------------------
      //
      //   Molecular Model Setup
      //

      function createModel() {
        initializeLocalVariables();
        model = Model({
            elements            : elements,
            temperature         : temperature,
            temperature_control : temperature_control,
            width               : width,
            height              : height,
            keShading           : keShading,
            chargeShading       : chargeShading,
            showVDWLines        : showVDWLines,
            showClock           : showClock,
            viewRefreshInterval : viewRefreshInterval,
            timeStep            : timeStep,
            viscosity           : viscosity,
            gravitationalField  : gravitationalField,
            images              : images
          });

        if (atoms) {
          model.createNewAtoms(atoms);
        } else if (mol_number) {
          model.createNewAtoms(mol_number);
          model.relax();
        } else {
          throw new Error("ModelController: tried to create a model without atoms or mol_number.");
        }

        if (radialBonds) model.createRadialBonds(radialBonds);
        if (angularBonds) model.createAngularBonds(angularBonds);
        if (showVDWLines) model.createVdwPairs(atoms);
        if (obstacles) model.createObstacles(obstacles);
      }

      function setupModel() {
        createModel();
        model.resetTime();
        model.on('tick', tickHandler);
        model.on('addAtom', resetModelPlayer);
      }

      /**
        Returns a customized interface to the model for use by the view
      */
      function getModelInterface() {
        return {
          model:                   model,
          fit_to_parent:           fit_to_parent,
          xmax:                    width,
          ymax:                    height,
          keShading:               keShading,
          chargeShading:           chargeShading,
          enableAtomTooltips:      enableAtomTooltips,
          images:                  images,
          interactiveUrl:          interactiveUrl,
          textBoxes:               textBoxes,
          get_results:             function() { return model.get_results(); },
          get_radial_bond_results: function() { return model.get_radial_bond_results(); },
          get_radial_bonds:        function() { return model.get_radial_bonds(); },
          get_obstacles:           function() { return model.get_obstacles(); },
          get_vdw_pairs:           function() { return model.get_vdw_pairs(); },
          set_atom_properties:     function() { return model.setAtomProperties.apply(model, arguments);  },
          is_stopped:              function() { return model.is_stopped(); },

          controlButtons:      controlButtons,
          modelTimeLabel:      modelTimeLabel
        };
      }

      // ------------------------------------------------------------
      //
      // Create Model Player
      //
      // ------------------------------------------------------------

      function setupModelPlayer() {

        // ------------------------------------------------------------
        //
        // Create player and container view for model
        //
        // ------------------------------------------------------------

        model_player = new ModelPlayer(modelProxy, false);
        // disable its 'forward' and 'back' actions:
        model_player.forward = function() {},
        model_player.back = function() {},

        moleculeContainer = MoleculeContainer(moleculeViewId, getModelInterface());

        moleculeContainer.updateMoleculeRadius();
        moleculeContainer.setup_drawables();
      }

      function resetModelPlayer() {

        // ------------------------------------------------------------
        //
        // reset player and container view for model
        //
        // ------------------------------------------------------------

        moleculeContainer.reset(getModelInterface());
        moleculeContainer.updateMoleculeRadius();
        moleculeContainer.setup_drawables();
      }

      /**
        Note: newModelConfig, newPlayerConfig are optional. Calling this without
        arguments will simply reload the current model.
      */
      function reload(newModelConfig, newPlayerConfig) {
        modelConfig = newModelConfig || modelConfig;
        playerConfig = newPlayerConfig || playerConfig;
        setupModel();
        resetModelPlayer();
        dispatch.modelReset();
      }

      function repaint() {
        moleculeContainer.setup_drawables();
      }

      // ------------------------------------------------------------
      //
      // Initial setup of this modelController:
      //
      // ------------------------------------------------------------

      if (typeof DEVELOPMENT === 'undefined') {
        try {
          setupModel();
        } catch(e) {
          alert(e);
          throw new Error(e);
        }
      } else {
        setupModel();
      }

      setupModelPlayer();
      dispatch.modelReset();

      // ------------------------------------------------------------
      //
      // Public methods
      //
      // ------------------------------------------------------------

      controller.on = function(type, listener) {
        dispatch.on(type, listener);
      };

      controller.reload = reload;
      controller.repaint = repaint;
      controller.moleculeContainer = moleculeContainer;

      return controller;
  };
});
