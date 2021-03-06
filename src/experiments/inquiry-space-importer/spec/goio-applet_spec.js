// Generated by CoffeeScript 1.3.3
(function() {

  describe("GoIOApplet class", function() {
    var goio;
    goio = null;
    beforeEach(function() {
      return goio = new ISImporter.GoIOApplet();
    });
    it("should exist", function() {
      return expect(goio).toBeDefined();
    });
    it("should be a subclass of SensorApplet", function() {
      return expect(goio.constructor.__super__).toBe(ISImporter.SensorApplet.prototype);
    });
    describe("when listenerPath and otmlPath properties are set appropriately", function() {
      beforeEach(function() {
        goio.listenerPath = '(dummy listener path)';
        return goio.otmlPath = '(dummy otml path)';
      });
      describe("getHTML method", function() {
        return it("should construct the appropriate applet tag", function() {
          return expect(goio.getHTML()).toBe(['<applet ', 'id="goio-applet" ', 'class="applet sensor-applet" ', 'archive="org/concord/sensor-native/sensor-native.jar, ', 'org/concord/otrunk/otrunk.jar, ', 'org/concord/framework/framework.jar, ', 'org/concord/frameworkview/frameworkview.jar, ', 'jug/jug/jug.jar, ', 'jdom/jdom/jdom.jar, ', 'org/concord/sensor/sensor.jar, ', 'org/concord/data/data.jar, ', 'org/concord/sensor/sensor-applets/sensor-applets.jar" ', 'code="org.concord.sensor.applet.OTSensorApplet" ', 'codebase="/jnlp" ', 'width="1px" ', 'height="1px" ', 'MAYSCRIPT="true" >', '<param name="resource" value="(dummy otml path)" />', '<param name="listenerPath" value="(dummy listener path)" />', '<param name="name" value="goio-applet" />', '</applet>'].join(''));
        });
      });
      return describe("testAppletReady method", function() {
        beforeEach(function() {
          goio.appletInstance = {
            initSensorInterface: function() {}
          };
          return spyOn(goio.appletInstance, 'initSensorInterface');
        });
        it("should pass the listenerPath to the initSensorInterface method of the applet instance", function() {
          goio.testAppletReady();
          return expect(goio.appletInstance.initSensorInterface).toHaveBeenCalledWith('(dummy listener path)');
        });
        describe("if initSensorInterface does not throw an error", function() {
          return it("should return true", function() {
            return expect(goio.testAppletReady()).toBe(true);
          });
        });
        return describe("if initSensorInterface throws an error", function() {
          beforeEach(function() {
            return goio.appletInstance.initSensorInterface.andThrow(new Error());
          });
          return it("should return false", function() {
            return expect(goio.testAppletReady()).toBe(false);
          });
        });
      });
    });
    describe("sensorsReady applet callback", function() {
      it("should call sensorIsReady parent method", function() {
        spyOn(goio, 'sensorIsReady');
        goio.sensorsReady();
        return expect(goio.sensorIsReady).toHaveBeenCalled();
      });
      describe("return value of getIsInAppletCallback method", function() {
        return describe("during sensorIsReady method", function() {
          var returnValueDuring;
          returnValueDuring = null;
          beforeEach(function() {
            returnValueDuring = null;
            return spyOn(goio, 'sensorIsReady').andCallFake(function() {
              return returnValueDuring = goio.getIsInAppletCallback();
            });
          });
          return it("should be true", function() {
            goio.sensorsReady();
            return expect(returnValueDuring).toBe(true);
          });
        });
      });
      return describe("after sensorsReady returns", function() {
        return it("should be false", function() {
          goio.sensorsReady();
          return expect(goio.getIsInAppletCallback()).toBe(false);
        });
      });
    });
    describe("The dataReceived applet callback", function() {
      var dataCb;
      dataCb = null;
      beforeEach(function() {
        dataCb = jasmine.createSpy('dataCb');
        return goio.on('data', dataCb);
      });
      it("should emit the 'data' event", function() {
        goio.dataReceived(null, 1, [1.0]);
        return expect(dataCb).toHaveBeenCalled();
      });
      describe("the data callback", function() {
        it("should be called while getIsInAppletCallback() returns true", function() {
          var wasIn;
          wasIn = null;
          dataCb.andCallFake(function() {
            return wasIn = goio.getIsInAppletCallback();
          });
          goio.dataReceived(null, 1, [1.0]);
          return expect(wasIn).toBe(true);
        });
        describe("when dataReceived is sent an array with a single datum", function() {
          return it("should be called with the datum received from the applet callback", function() {
            goio.dataReceived(null, 1, [1.0]);
            return expect(dataCb).toHaveBeenCalledWith(1.0);
          });
        });
        return describe("when dataReceived is sent an array with more than one datum", function() {
          return it("should be called once with each datum", function() {
            goio.dataReceived(null, 2, [1.0, 2.0]);
            expect(dataCb.callCount).toBe(2);
            expect(dataCb.argsForCall[0]).toEqual([1.0]);
            return expect(dataCb.argsForCall[1]).toEqual([2.0]);
          });
        });
      });
      return describe("after dataReceived returns", function() {
        beforeEach(function() {
          return goio.dataReceived();
        });
        return describe("getIsInAppletCallback method", function() {
          return it("should return false", function() {
            return expect(goio.getIsInAppletCallback()).toBe(false);
          });
        });
      });
    });
    describe("The dataStreamEvent applet callback", function() {
      it("should exist and be callable", function() {
        return expect(typeof goio.dataStreamEvent).toBe('function');
      });
      return it("should not throw an error", function() {
        return expect(goio.dataStreamEvent).not.toThrow();
      });
    });
    describe("_stopSensor method", function() {
      beforeEach(function() {
        goio.appletInstance = {
          stopCollecting: function() {}
        };
        return spyOn(goio.appletInstance, 'stopCollecting');
      });
      describe("when called from outside an applet callback", function() {
        return it("should call the applet stopCollecting method", function() {
          goio._stopSensor();
          return expect(goio.appletInstance.stopCollecting).toHaveBeenCalled();
        });
      });
      return describe("when called from within an applet callback", function() {
        beforeEach(function() {
          goio.startAppletCallback();
          return runs(function() {
            return goio._stopSensor();
          });
        });
        describe("immediately", function() {
          return it("should not have called the applet stopCollecting method", function() {
            return runs(function() {
              return expect(goio.appletInstance.stopCollecting).not.toHaveBeenCalled();
            });
          });
        });
        return describe("after waiting", function() {
          beforeEach(function() {
            return waits(100);
          });
          return it("should have called the applet stopCollecting method", function() {
            return runs(function() {
              return expect(goio.appletInstance.stopCollecting).toHaveBeenCalled();
            });
          });
        });
      });
    });
    return describe("_startSensor method", function() {
      beforeEach(function() {
        goio.appletInstance = {
          startCollecting: function() {}
        };
        return spyOn(goio.appletInstance, 'startCollecting');
      });
      describe("when called from outside an applet callback", function() {
        return it("should call the applet startCollecting method", function() {
          goio._startSensor();
          return expect(goio.appletInstance.startCollecting).toHaveBeenCalled();
        });
      });
      return describe("when called from within an applet callback", function() {
        beforeEach(function() {
          goio.startAppletCallback();
          return runs(function() {
            return goio._startSensor();
          });
        });
        describe("immediately", function() {
          return it("should not have called the applet startCollecting method", function() {
            return runs(function() {
              return expect(goio.appletInstance.startCollecting).not.toHaveBeenCalled();
            });
          });
        });
        return describe("after waiting", function() {
          beforeEach(function() {
            return waits(100);
          });
          return it("should have called the applet stopCollecting method", function() {
            return runs(function() {
              return expect(goio.appletInstance.startCollecting).toHaveBeenCalled();
            });
          });
        });
      });
    });
  });

  /*
  
  responsibilities of SensorApplet
  
    # SHOULD THERE BE a division of responsibility between SensorApplet and GoIOApplet?
  
    appends applet tag to DOM
    waits for applet startup
    records start and end of applet callback (should never call applet method within applet callback, apparently)
    removes applet tag from DOM when requested
  reacords lifecycle of applet (not appended, appended, applet ready, sensors ready, removed)
  
  responsibilities of GoIOApplet
    constructs appropriate applet tag
  
  
  
    forwards sensor ready event to callback
    forwards data received events to callback
    forwards metadata events to callback (if ever implemented)
  */


}).call(this);
