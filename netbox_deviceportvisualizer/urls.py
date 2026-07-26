from django.urls import path

from . import views

app_name = 'netbox_deviceportvisualizer'

urlpatterns = (
    path('layouts/', views.LayoutIndexView.as_view(), name='layout_index'),
)
