from netbox.api.routers import NetBoxRouter

from . import views

app_name = 'netbox_deviceportvisualizer-api'

router = NetBoxRouter()
router.register('component-positions', views.ComponentPositionViewSet)

urlpatterns = router.urls
