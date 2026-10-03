
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "catalog_board_aliases": {
                  Row: {
                    "alias": string,"alias_norm": string | null,"board_id": string,"created_at": string,"created_by": string | null,"id": string
                  }
                  Insert: {
                    "alias": string,"alias_norm"?: never,"board_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string
                  }
                  Update: {
                    "alias"?: string,"alias_norm"?: never,"board_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_board_aliases_board_id_fkey"
      columns: ["board_id"]
isOneToOne: false
      referencedRelation: "catalog_boards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_board_aliases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_boards": {
                  Row: {
                    "board_number": string,"board_number_norm": string | null,"created_at": string,"created_by": string | null,"id": string,"manufacturer": string | null,"notes": string | null,"updated_at": string
                  }
                  Insert: {
                    "board_number": string,"board_number_norm"?: never,"created_at"?: string,"created_by"?: string | null,"id"?: string,"manufacturer"?: string | null,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "board_number"?: string,"board_number_norm"?: never,"created_at"?: string,"created_by"?: string | null,"id"?: string,"manufacturer"?: string | null,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_boards_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_brands": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"name_norm": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"name_norm"?: never
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"name_norm"?: never
                  }
                  Relationships: [
                    
                  ]
                },"catalog_model_aliases": {
                  Row: {
                    "alias": string,"alias_norm": string | null,"created_at": string,"created_by": string | null,"id": string,"model_id": string,"source": string,"variant_id": string | null
                  }
                  Insert: {
                    "alias": string,"alias_norm"?: never,"created_at"?: string,"created_by"?: string | null,"id"?: string,"model_id": string,"source": string,"variant_id"?: string | null
                  }
                  Update: {
                    "alias"?: string,"alias_norm"?: never,"created_at"?: string,"created_by"?: string | null,"id"?: string,"model_id"?: string,"source"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_model_aliases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_model_aliases_model_id_fkey"
      columns: ["model_id"]
isOneToOne: false
      referencedRelation: "catalog_models"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_model_aliases_variant_fk"
      columns: ["variant_id","model_id"]
isOneToOne: false
      referencedRelation: "catalog_variants"
      referencedColumns: ["id","model_id"]
    }
                  ]
                },"catalog_model_boards": {
                  Row: {
                    "board_id": string,"created_at": string,"created_by": string | null,"id": string,"model_id": string,"note": string | null,"variant_id": string | null
                  }
                  Insert: {
                    "board_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"model_id": string,"note"?: string | null,"variant_id"?: string | null
                  }
                  Update: {
                    "board_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"model_id"?: string,"note"?: string | null,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_model_boards_board_id_fkey"
      columns: ["board_id"]
isOneToOne: false
      referencedRelation: "catalog_boards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_model_boards_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_model_boards_model_id_fkey"
      columns: ["model_id"]
isOneToOne: false
      referencedRelation: "catalog_models"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_model_boards_variant_fk"
      columns: ["variant_id","model_id"]
isOneToOne: false
      referencedRelation: "catalog_variants"
      referencedColumns: ["id","model_id"]
    }
                  ]
                },"catalog_models": {
                  Row: {
                    "brand_id": string,"created_at": string,"created_by": string | null,"device_type": Database["public"]['Enums']["device_type"] | null,"id": string,"name": string,"name_norm": string | null,"needs_review": boolean,"notes": string | null,"release_year": number | null,"updated_at": string
                  }
                  Insert: {
                    "brand_id": string,"created_at"?: string,"created_by"?: string | null,"device_type"?: Database["public"]['Enums']["device_type"] | null,"id"?: string,"name": string,"name_norm"?: never,"needs_review"?: boolean,"notes"?: string | null,"release_year"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"created_by"?: string | null,"device_type"?: Database["public"]['Enums']["device_type"] | null,"id"?: string,"name"?: string,"name_norm"?: never,"needs_review"?: boolean,"notes"?: string | null,"release_year"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_models_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "catalog_brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_models_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_ticket_link_log": {
                  Row: {
                    "action": string,"alias_id": string | null,"done_at": string,"done_by": string | null,"id": string,"new_model_id": string | null,"new_variant_id": string | null,"old_model_id": string | null,"old_variant_id": string | null,"ticket_id": string
                  }
                  Insert: {
                    "action": string,"alias_id"?: string | null,"done_at"?: string,"done_by"?: string | null,"id"?: string,"new_model_id"?: string | null,"new_variant_id"?: string | null,"old_model_id"?: string | null,"old_variant_id"?: string | null,"ticket_id": string
                  }
                  Update: {
                    "action"?: string,"alias_id"?: string | null,"done_at"?: string,"done_by"?: string | null,"id"?: string,"new_model_id"?: string | null,"new_variant_id"?: string | null,"old_model_id"?: string | null,"old_variant_id"?: string | null,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_ticket_link_log_alias_id_fkey"
      columns: ["alias_id"]
isOneToOne: false
      referencedRelation: "catalog_model_aliases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_ticket_link_log_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_variants": {
                  Row: {
                    "created_at": string,"id": string,"model_id": string,"name": string,"name_norm": string | null,"notes": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"model_id": string,"name": string,"name_norm"?: never,"notes"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"model_id"?: string,"name"?: string,"name_norm"?: never,"notes"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_variants_model_id_fkey"
      columns: ["model_id"]
isOneToOne: false
      referencedRelation: "catalog_models"
      referencedColumns: ["id"]
    }
                  ]
                },"compatibility_evidence": {
                  Row: {
                    "compatibility_id": string,"created_at": string,"created_by": string,"id": string,"kind": string,"limitation_note": string | null,"note": string | null,"observed_status": string,"reference": string | null,"retract_reason": string | null,"retracted_at": string | null,"retracted_by": string | null,"ticket_id": string | null,"ticket_material_id": string | null
                  }
                  Insert: {
                    "compatibility_id": string,"created_at"?: string,"created_by": string,"id"?: string,"kind": string,"limitation_note"?: string | null,"note"?: string | null,"observed_status": string,"reference"?: string | null,"retract_reason"?: string | null,"retracted_at"?: string | null,"retracted_by"?: string | null,"ticket_id"?: string | null,"ticket_material_id"?: string | null
                  }
                  Update: {
                    "compatibility_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"kind"?: string,"limitation_note"?: string | null,"note"?: string | null,"observed_status"?: string,"reference"?: string | null,"retract_reason"?: string | null,"retracted_at"?: string | null,"retracted_by"?: string | null,"ticket_id"?: string | null,"ticket_material_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "compatibility_evidence_compatibility_id_fkey"
      columns: ["compatibility_id"]
isOneToOne: false
      referencedRelation: "part_compatibility"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compatibility_evidence_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compatibility_evidence_retracted_by_fkey"
      columns: ["retracted_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compatibility_evidence_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compatibility_evidence_ticket_material_id_fkey"
      columns: ["ticket_material_id"]
isOneToOne: false
      referencedRelation: "repair_parts_used"
      referencedColumns: ["material_id"]
    },{
      foreignKeyName: "compatibility_evidence_ticket_material_id_fkey"
      columns: ["ticket_material_id"]
isOneToOne: false
      referencedRelation: "ticket_materials"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "address": string | null,"created_at": string,"id": string,"name": string,"phone": string
                  }
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"id"?: string,"name": string,"phone": string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"phone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"device_models": {
                  Row: {
                    "brand": string,"created_at": string,"id": string,"min_repair_cost": number | null,"model_name": string,"release_price": number | null,"release_year": number | null,"specs": Json | null,"tag_info": string | null
                  }
                  Insert: {
                    "brand": string,"created_at"?: string,"id"?: string,"min_repair_cost"?: number | null,"model_name": string,"release_price"?: number | null,"release_year"?: number | null,"specs"?: Json | null,"tag_info"?: string | null
                  }
                  Update: {
                    "brand"?: string,"created_at"?: string,"id"?: string,"min_repair_cost"?: number | null,"model_name"?: string,"release_price"?: number | null,"release_year"?: number | null,"specs"?: Json | null,"tag_info"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"donor_devices": {
                  Row: {
                    "brand": string,"catalog_board_id": string | null,"catalog_model_id": string | null,"catalog_variant_id": string | null,"condition_note": string | null,"consent_confirmed_at": string,"consent_confirmed_by": string,"created_at": string,"created_by": string | null,"device_type": Database["public"]['Enums']["device_type"],"donor_no": string,"id": string,"model_text": string | null,"source_ticket_id": string,"status": string,"storage_location_id": string | null,"storage_note": string | null,"tag_info": string | null,"updated_at": string
                  }
                  Insert: {
                    "brand": string,"catalog_board_id"?: string | null,"catalog_model_id"?: string | null,"catalog_variant_id"?: string | null,"condition_note"?: string | null,"consent_confirmed_at": string,"consent_confirmed_by": string,"created_at"?: string,"created_by"?: string | null,"device_type": Database["public"]['Enums']["device_type"],"donor_no"?: string,"id"?: string,"model_text"?: string | null,"source_ticket_id": string,"status"?: string,"storage_location_id"?: string | null,"storage_note"?: string | null,"tag_info"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "brand"?: string,"catalog_board_id"?: string | null,"catalog_model_id"?: string | null,"catalog_variant_id"?: string | null,"condition_note"?: string | null,"consent_confirmed_at"?: string,"consent_confirmed_by"?: string,"created_at"?: string,"created_by"?: string | null,"device_type"?: Database["public"]['Enums']["device_type"],"donor_no"?: string,"id"?: string,"model_text"?: string | null,"source_ticket_id"?: string,"status"?: string,"storage_location_id"?: string | null,"storage_note"?: string | null,"tag_info"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "donor_devices_catalog_board_id_fkey"
      columns: ["catalog_board_id"]
isOneToOne: false
      referencedRelation: "catalog_boards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_devices_catalog_model_id_fkey"
      columns: ["catalog_model_id"]
isOneToOne: false
      referencedRelation: "catalog_models"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_devices_consent_confirmed_by_fkey"
      columns: ["consent_confirmed_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_devices_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_devices_source_ticket_id_fkey"
      columns: ["source_ticket_id"]
isOneToOne: true
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_devices_storage_location_id_fkey"
      columns: ["storage_location_id"]
isOneToOne: false
      referencedRelation: "storage_locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_devices_variant_fk"
      columns: ["catalog_variant_id","catalog_model_id"]
isOneToOne: false
      referencedRelation: "catalog_variants"
      referencedColumns: ["id","model_id"]
    }
                  ]
                },"donor_part_candidates": {
                  Row: {
                    "category_id": string | null,"condition_estimate": string,"created_at": string,"created_by": string | null,"description": string,"donor_id": string,"extracted_at": string | null,"extracted_by": string | null,"id": string,"inventory_item_id": string | null,"note": string | null,"part_spec_id": string | null,"quantity": number,"return_capacity": string | null,"return_name": string | null,"return_spec": string | null,"source_removed_part_id": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "category_id"?: string | null,"condition_estimate"?: string,"created_at"?: string,"created_by"?: string | null,"description": string,"donor_id": string,"extracted_at"?: string | null,"extracted_by"?: string | null,"id"?: string,"inventory_item_id"?: string | null,"note"?: string | null,"part_spec_id"?: string | null,"quantity"?: number,"return_capacity"?: string | null,"return_name"?: string | null,"return_spec"?: string | null,"source_removed_part_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"condition_estimate"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"donor_id"?: string,"extracted_at"?: string | null,"extracted_by"?: string | null,"id"?: string,"inventory_item_id"?: string | null,"note"?: string | null,"part_spec_id"?: string | null,"quantity"?: number,"return_capacity"?: string | null,"return_name"?: string | null,"return_spec"?: string | null,"source_removed_part_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "donor_part_candidates_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "inventory_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_part_candidates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_part_candidates_donor_id_fkey"
      columns: ["donor_id"]
isOneToOne: false
      referencedRelation: "donor_devices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_part_candidates_donor_id_fkey"
      columns: ["donor_id"]
isOneToOne: false
      referencedRelation: "donor_potential_stock"
      referencedColumns: ["donor_id"]
    },{
      foreignKeyName: "donor_part_candidates_extracted_by_fkey"
      columns: ["extracted_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_part_candidates_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_part_candidates_part_spec_id_fkey"
      columns: ["part_spec_id"]
isOneToOne: false
      referencedRelation: "part_specs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_part_candidates_source_removed_part_id_fkey"
      columns: ["source_removed_part_id"]
isOneToOne: false
      referencedRelation: "ticket_removed_parts"
      referencedColumns: ["id"]
    }
                  ]
                },"donor_photos": {
                  Row: {
                    "created_at": string,"description": string | null,"donor_id": string,"id": string,"path": string,"uploaded_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"donor_id": string,"id"?: string,"path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"donor_id"?: string,"id"?: string,"path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "donor_photos_donor_id_fkey"
      columns: ["donor_id"]
isOneToOne: false
      referencedRelation: "donor_devices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donor_photos_donor_id_fkey"
      columns: ["donor_id"]
isOneToOne: false
      referencedRelation: "donor_potential_stock"
      referencedColumns: ["donor_id"]
    },{
      foreignKeyName: "donor_photos_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"employees": {
                  Row: {
                    "created_at": string,"id": string,"is_assignable": boolean,"name": string,"phone": string | null,"role": Database["public"]['Enums']["employee_role"]
                  }
                  Insert: {
                    "created_at"?: string,"id": string,"is_assignable"?: boolean,"name": string,"phone"?: string | null,"role": Database["public"]['Enums']["employee_role"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_assignable"?: boolean,"name"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["employee_role"]
                  }
                  Relationships: [
                    
                  ]
                },"global_settings": {
                  Row: {
                    "base_service_cost": number,"discount_surcharge_rate": number,"id": boolean,"ri_approval_gate_enabled": boolean,"ri_cancel_gate_enabled": boolean,"ri_purchase_guard_enabled": boolean,"updated_at": string,"value_reference_amount": number
                  }
                  Insert: {
                    "base_service_cost"?: number,"discount_surcharge_rate"?: number,"id"?: boolean,"ri_approval_gate_enabled"?: boolean,"ri_cancel_gate_enabled"?: boolean,"ri_purchase_guard_enabled"?: boolean,"updated_at"?: string,"value_reference_amount"?: number
                  }
                  Update: {
                    "base_service_cost"?: number,"discount_surcharge_rate"?: number,"id"?: boolean,"ri_approval_gate_enabled"?: boolean,"ri_cancel_gate_enabled"?: boolean,"ri_purchase_guard_enabled"?: boolean,"updated_at"?: string,"value_reference_amount"?: number
                  }
                  Relationships: [
                    
                  ]
                },"interchange_groups": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"note": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"note"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "interchange_groups_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory": {
                  Row: {
                    "condition": Database["public"]['Enums']["inventory_condition"],"cost_price": number,"created_at": string,"id": string,"part_name": string,"quantity": number
                  }
                  Insert: {
                    "condition": Database["public"]['Enums']["inventory_condition"],"cost_price"?: number,"created_at"?: string,"id"?: string,"part_name": string,"quantity"?: number
                  }
                  Update: {
                    "condition"?: Database["public"]['Enums']["inventory_condition"],"cost_price"?: number,"created_at"?: string,"id"?: string,"part_name"?: string,"quantity"?: number
                  }
                  Relationships: [
                    
                  ]
                },"inventory_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"inventory_items": {
                  Row: {
                    "base_estimate": number,"capacity": string | null,"category_id": string,"condition": Database["public"]['Enums']["item_condition"],"created_at": string,"id": string,"label_code": string,"part_spec_id": string | null,"product_id": string,"quantity": number,"spec_id": string,"storage_location_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "base_estimate"?: number,"capacity"?: string | null,"category_id": string,"condition"?: Database["public"]['Enums']["item_condition"],"created_at"?: string,"id"?: string,"label_code"?: string,"part_spec_id"?: string | null,"product_id": string,"quantity"?: number,"spec_id": string,"storage_location_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "base_estimate"?: number,"capacity"?: string | null,"category_id"?: string,"condition"?: Database["public"]['Enums']["item_condition"],"created_at"?: string,"id"?: string,"label_code"?: string,"part_spec_id"?: string | null,"product_id"?: string,"quantity"?: number,"spec_id"?: string,"storage_location_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "inventory_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_items_part_spec_id_fkey"
      columns: ["part_spec_id"]
isOneToOne: false
      referencedRelation: "part_specs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "inventory_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_items_spec_id_fkey"
      columns: ["spec_id"]
isOneToOne: false
      referencedRelation: "inventory_specs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_items_storage_location_id_fkey"
      columns: ["storage_location_id"]
isOneToOne: false
      referencedRelation: "storage_locations"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_products": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"spec_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"spec_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"spec_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_products_spec_id_fkey"
      columns: ["spec_id"]
isOneToOne: false
      referencedRelation: "inventory_specs"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_specs": {
                  Row: {
                    "category_id": string,"created_at": string,"id": string,"name": string
                  }
                  Insert: {
                    "category_id": string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_specs_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "inventory_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_transactions": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string,"notes": string | null,"quantity_changed": number,"ticket_id": string | null,"transaction_type": Database["public"]['Enums']["inventory_transaction_type"],"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"notes"?: string | null,"quantity_changed": number,"ticket_id"?: string | null,"transaction_type": Database["public"]['Enums']["inventory_transaction_type"],"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"notes"?: string | null,"quantity_changed"?: number,"ticket_id"?: string | null,"transaction_type"?: Database["public"]['Enums']["inventory_transaction_type"],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_transactions_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_transactions_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_transactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"model_notes": {
                  Row: {
                    "board_id": string | null,"body": string,"created_at": string,"created_by": string | null,"id": string,"is_pinned": boolean,"model_id": string | null,"note_type": string,"updated_at": string,"updated_by": string | null,"variant_id": string | null
                  }
                  Insert: {
                    "board_id"?: string | null,"body": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_pinned"?: boolean,"model_id"?: string | null,"note_type"?: string,"updated_at"?: string,"updated_by"?: string | null,"variant_id"?: string | null
                  }
                  Update: {
                    "board_id"?: string | null,"body"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_pinned"?: boolean,"model_id"?: string | null,"note_type"?: string,"updated_at"?: string,"updated_by"?: string | null,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "model_notes_board_id_fkey"
      columns: ["board_id"]
isOneToOne: false
      referencedRelation: "catalog_boards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "model_notes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "model_notes_model_id_fkey"
      columns: ["model_id"]
isOneToOne: false
      referencedRelation: "catalog_models"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "model_notes_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "model_notes_variant_fk"
      columns: ["variant_id","model_id"]
isOneToOne: false
      referencedRelation: "catalog_variants"
      referencedColumns: ["id","model_id"]
    }
                  ]
                },"news_items": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"news_date": string,"published_at": string | null,"source": string,"source_url": string | null,"status": string,"summary": string,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "body"?: string,"created_at"?: string,"id"?: string,"news_date"?: string,"published_at"?: string | null,"source"?: string,"source_url"?: string | null,"status"?: string,"summary"?: string,"title": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"news_date"?: string,"published_at"?: string | null,"source"?: string,"source_url"?: string | null,"status"?: string,"summary"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "news_items_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"page_contents": {
                  Row: {
                    "content_data": NonNullable<Json>,"created_at": string,"id": string,"page_key": string,"section_key": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "content_data"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"page_key": string,"section_key": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "content_data"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"page_key"?: string,"section_key"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "page_contents_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"part_compatibility": {
                  Row: {
                    "board_id": string | null,"confidence": string,"created_at": string,"id": string,"limitation_note": string | null,"model_id": string | null,"part_spec_id": string,"status": string,"updated_at": string,"variant_id": string | null
                  }
                  Insert: {
                    "board_id"?: string | null,"confidence"?: string,"created_at"?: string,"id"?: string,"limitation_note"?: string | null,"model_id"?: string | null,"part_spec_id": string,"status"?: string,"updated_at"?: string,"variant_id"?: string | null
                  }
                  Update: {
                    "board_id"?: string | null,"confidence"?: string,"created_at"?: string,"id"?: string,"limitation_note"?: string | null,"model_id"?: string | null,"part_spec_id"?: string,"status"?: string,"updated_at"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "part_compatibility_board_id_fkey"
      columns: ["board_id"]
isOneToOne: false
      referencedRelation: "catalog_boards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_compatibility_model_id_fkey"
      columns: ["model_id"]
isOneToOne: false
      referencedRelation: "catalog_models"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_compatibility_part_spec_id_fkey"
      columns: ["part_spec_id"]
isOneToOne: false
      referencedRelation: "part_specs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_compatibility_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "catalog_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"part_number_aliases": {
                  Row: {
                    "alias": string,"alias_norm": string | null,"alias_type": string,"created_at": string,"created_by": string | null,"id": string,"part_spec_id": string
                  }
                  Insert: {
                    "alias": string,"alias_norm"?: never,"alias_type"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"part_spec_id": string
                  }
                  Update: {
                    "alias"?: string,"alias_norm"?: never,"alias_type"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"part_spec_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "part_number_aliases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_number_aliases_part_spec_id_fkey"
      columns: ["part_spec_id"]
isOneToOne: false
      referencedRelation: "part_specs"
      referencedColumns: ["id"]
    }
                  ]
                },"part_specs": {
                  Row: {
                    "compat_target": string,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"interchange_group_id": string | null,"manufacturer": string | null,"name": string,"name_norm": string | null,"needs_review": boolean,"part_type": string,"updated_at": string
                  }
                  Insert: {
                    "compat_target": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"interchange_group_id"?: string | null,"manufacturer"?: string | null,"name": string,"name_norm"?: never,"needs_review"?: boolean,"part_type": string,"updated_at"?: string
                  }
                  Update: {
                    "compat_target"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"interchange_group_id"?: string | null,"manufacturer"?: string | null,"name"?: string,"name_norm"?: never,"needs_review"?: boolean,"part_type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "part_specs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_specs_interchange_group_id_fkey"
      columns: ["interchange_group_id"]
isOneToOne: false
      referencedRelation: "interchange_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_guard_logs": {
                  Row: {
                    "created_at": string,"id": string,"item_label": string,"material_id": string,"quantity": number,"reason_code": string | null,"reason_note": string | null,"requested_by": string,"resource_count": number,"resources": NonNullable<Json>,"ticket_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_label": string,"material_id": string,"quantity": number,"reason_code"?: string | null,"reason_note"?: string | null,"requested_by": string,"resource_count": number,"resources"?: NonNullable<Json>,"ticket_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_label"?: string,"material_id"?: string,"quantity"?: number,"reason_code"?: string | null,"reason_note"?: string | null,"requested_by"?: string,"resource_count"?: number,"resources"?: NonNullable<Json>,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_guard_logs_material_id_fkey"
      columns: ["material_id"]
isOneToOne: true
      referencedRelation: "repair_parts_used"
      referencedColumns: ["material_id"]
    },{
      foreignKeyName: "purchase_guard_logs_material_id_fkey"
      columns: ["material_id"]
isOneToOne: true
      referencedRelation: "ticket_materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_guard_logs_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_guard_logs_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"receipt_no_sequence": {
                  Row: {
                    "current_seq": number,"date_key": string
                  }
                  Insert: {
                    "current_seq"?: number,"date_key": string
                  }
                  Update: {
                    "current_seq"?: number,"date_key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"refund_no_sequence": {
                  Row: {
                    "current_seq": number,"date_key": string
                  }
                  Insert: {
                    "current_seq"?: number,"date_key": string
                  }
                  Update: {
                    "current_seq"?: number,"date_key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"repair_actions": {
                  Row: {
                    "action_type": string,"description": string,"fault_id": string | null,"id": string,"performed_at": string,"performed_by": string | null,"sort_order": number,"succeeded": boolean | null,"ticket_id": string
                  }
                  Insert: {
                    "action_type"?: string,"description": string,"fault_id"?: string | null,"id"?: string,"performed_at"?: string,"performed_by"?: string | null,"sort_order"?: number,"succeeded"?: boolean | null,"ticket_id": string
                  }
                  Update: {
                    "action_type"?: string,"description"?: string,"fault_id"?: string | null,"id"?: string,"performed_at"?: string,"performed_by"?: string | null,"sort_order"?: number,"succeeded"?: boolean | null,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "repair_actions_fault_id_fkey"
      columns: ["fault_id"]
isOneToOne: false
      referencedRelation: "repair_faults"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repair_actions_performed_by_fkey"
      columns: ["performed_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repair_actions_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"repair_faults": {
                  Row: {
                    "component": string,"created_at": string,"created_by": string | null,"description": string | null,"fault_type": string,"id": string,"sort_order": number,"ticket_id": string
                  }
                  Insert: {
                    "component": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"fault_type"?: string,"id"?: string,"sort_order"?: number,"ticket_id": string
                  }
                  Update: {
                    "component"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"fault_type"?: string,"id"?: string,"sort_order"?: number,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "repair_faults_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repair_faults_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"repair_measurements": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"judgement": string,"kind": string,"label": string,"note": string | null,"sort_order": number,"ticket_id": string,"unit": string | null,"value": number | null,"value_text": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"judgement"?: string,"kind"?: string,"label": string,"note"?: string | null,"sort_order"?: number,"ticket_id": string,"unit"?: string | null,"value"?: number | null,"value_text"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"judgement"?: string,"kind"?: string,"label"?: string,"note"?: string | null,"sort_order"?: number,"ticket_id"?: string,"unit"?: string | null,"value"?: number | null,"value_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "repair_measurements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repair_measurements_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"repair_records": {
                  Row: {
                    "created_at": string,"created_by": string | null,"diagnosis_summary": string | null,"fault_category": string | null,"id": string,"notes": string | null,"removed_parts_confirmed": boolean,"result": string | null,"ticket_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"diagnosis_summary"?: string | null,"fault_category"?: string | null,"id"?: string,"notes"?: string | null,"removed_parts_confirmed"?: boolean,"result"?: string | null,"ticket_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"diagnosis_summary"?: string | null,"fault_category"?: string | null,"id"?: string,"notes"?: string | null,"removed_parts_confirmed"?: boolean,"result"?: string | null,"ticket_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "repair_records_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repair_records_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: true
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repair_records_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"repair_tickets": {
                  Row: {
                    "assignee_id": string | null,"cancel_device_disposal": string | null,"canceled_at": string | null,"cash_receipt_issued": boolean | null,"catalog_board_id": string | null,"catalog_model_id": string | null,"catalog_variant_id": string | null,"completed_at": string | null,"confirmed_estimate": number | null,"created_at": string,"customer_id": string,"device_brand": string,"device_model": string | null,"device_type": Database["public"]['Enums']["device_type"],"dispose_confirmed_at": string | null,"evaluated_value": number | null,"expected_estimate": number,"final_price": number,"has_admin_message": boolean,"id": string,"images": NonNullable<Json>,"initial_estimate": number,"is_approved": boolean,"is_test": boolean,"material_cost": number,"material_cost_details": NonNullable<Json>,"minimum_estimate": number | null,"paid_at": string | null,"payment_method": string | null,"payment_status": Database["public"]['Enums']["payment_status"],"receipt_no": string,"receipt_type": Database["public"]['Enums']["receipt_type"],"received_at": string | null,"refunded_amount": number,"release_year": string | null,"status": Database["public"]['Enums']["ticket_status"],"symptoms": string,"tag_info": string | null,"updated_at": string
                  }
                  Insert: {
                    "assignee_id"?: string | null,"cancel_device_disposal"?: string | null,"canceled_at"?: string | null,"cash_receipt_issued"?: boolean | null,"catalog_board_id"?: string | null,"catalog_model_id"?: string | null,"catalog_variant_id"?: string | null,"completed_at"?: string | null,"confirmed_estimate"?: number | null,"created_at"?: string,"customer_id": string,"device_brand": string,"device_model"?: string | null,"device_type"?: Database["public"]['Enums']["device_type"],"dispose_confirmed_at"?: string | null,"evaluated_value"?: number | null,"expected_estimate"?: number,"final_price"?: number,"has_admin_message"?: boolean,"id"?: string,"images"?: NonNullable<Json>,"initial_estimate"?: number,"is_approved"?: boolean,"is_test"?: boolean,"material_cost"?: number,"material_cost_details"?: NonNullable<Json>,"minimum_estimate"?: number | null,"paid_at"?: string | null,"payment_method"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"receipt_no": string,"receipt_type": Database["public"]['Enums']["receipt_type"],"received_at"?: string | null,"refunded_amount"?: number,"release_year"?: string | null,"status"?: Database["public"]['Enums']["ticket_status"],"symptoms": string,"tag_info"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "assignee_id"?: string | null,"cancel_device_disposal"?: string | null,"canceled_at"?: string | null,"cash_receipt_issued"?: boolean | null,"catalog_board_id"?: string | null,"catalog_model_id"?: string | null,"catalog_variant_id"?: string | null,"completed_at"?: string | null,"confirmed_estimate"?: number | null,"created_at"?: string,"customer_id"?: string,"device_brand"?: string,"device_model"?: string | null,"device_type"?: Database["public"]['Enums']["device_type"],"dispose_confirmed_at"?: string | null,"evaluated_value"?: number | null,"expected_estimate"?: number,"final_price"?: number,"has_admin_message"?: boolean,"id"?: string,"images"?: NonNullable<Json>,"initial_estimate"?: number,"is_approved"?: boolean,"is_test"?: boolean,"material_cost"?: number,"material_cost_details"?: NonNullable<Json>,"minimum_estimate"?: number | null,"paid_at"?: string | null,"payment_method"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"receipt_no"?: string,"receipt_type"?: Database["public"]['Enums']["receipt_type"],"received_at"?: string | null,"refunded_amount"?: number,"release_year"?: string | null,"status"?: Database["public"]['Enums']["ticket_status"],"symptoms"?: string,"tag_info"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "repair_tickets_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repair_tickets_catalog_board_fk"
      columns: ["catalog_board_id"]
isOneToOne: false
      referencedRelation: "catalog_boards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repair_tickets_catalog_model_fk"
      columns: ["catalog_model_id"]
isOneToOne: false
      referencedRelation: "catalog_models"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repair_tickets_catalog_variant_fk"
      columns: ["catalog_variant_id","catalog_model_id"]
isOneToOne: false
      referencedRelation: "catalog_variants"
      referencedColumns: ["id","model_id"]
    },{
      foreignKeyName: "repair_tickets_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                },"storage_locations": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"is_active": boolean,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "storage_locations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"symptom_codes": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"parent_id": string | null,"sort_order": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"parent_id"?: string | null,"sort_order"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"parent_id"?: string | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "symptom_codes_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "symptom_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_close_overrides": {
                  Row: {
                    "created_at": string,"gate": string,"id": string,"missing": NonNullable<Json>,"overridden_by": string,"reason": string,"ticket_id": string
                  }
                  Insert: {
                    "created_at"?: string,"gate": string,"id"?: string,"missing": NonNullable<Json>,"overridden_by": string,"reason": string,"ticket_id": string
                  }
                  Update: {
                    "created_at"?: string,"gate"?: string,"id"?: string,"missing"?: NonNullable<Json>,"overridden_by"?: string,"reason"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_close_overrides_overridden_by_fkey"
      columns: ["overridden_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_close_overrides_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_logs": {
                  Row: {
                    "created_at": string,"employee_id": string,"id": string,"message": string,"ticket_id": string
                  }
                  Insert: {
                    "created_at"?: string,"employee_id": string,"id"?: string,"message": string,"ticket_id": string
                  }
                  Update: {
                    "created_at"?: string,"employee_id"?: string,"id"?: string,"message"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_logs_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_logs_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_materials": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"inventory_item_id": string,"is_return_registered": boolean,"notes": string | null,"override_unit_price": number | null,"quantity": number,"request_status": Database["public"]['Enums']["material_request_status"],"request_type": string,"return_capacity": string | null,"return_category_id": string | null,"return_condition": string | null,"return_name": string | null,"return_quantity": number,"return_spec": string | null,"return_status": string | null,"ticket_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"inventory_item_id": string,"is_return_registered"?: boolean,"notes"?: string | null,"override_unit_price"?: number | null,"quantity"?: number,"request_status"?: Database["public"]['Enums']["material_request_status"],"request_type"?: string,"return_capacity"?: string | null,"return_category_id"?: string | null,"return_condition"?: string | null,"return_name"?: string | null,"return_quantity"?: number,"return_spec"?: string | null,"return_status"?: string | null,"ticket_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"inventory_item_id"?: string,"is_return_registered"?: boolean,"notes"?: string | null,"override_unit_price"?: number | null,"quantity"?: number,"request_status"?: Database["public"]['Enums']["material_request_status"],"request_type"?: string,"return_capacity"?: string | null,"return_category_id"?: string | null,"return_condition"?: string | null,"return_name"?: string | null,"return_quantity"?: number,"return_spec"?: string | null,"return_status"?: string | null,"ticket_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_materials_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_materials_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_materials_return_category_id_fkey"
      columns: ["return_category_id"]
isOneToOne: false
      referencedRelation: "inventory_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_materials_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_refunds": {
                  Row: {
                    "amount": number,"approved_at": string | null,"approved_by": string | null,"cash_receipt_cancel_required": boolean,"cash_receipt_canceled_at": string | null,"completed_at": string | null,"completed_by": string | null,"created_at": string,"deduction_amount": number,"deduction_note": string | null,"evidence": NonNullable<Json>,"id": string,"material_adjustments": NonNullable<Json>,"origin_payment_method": string,"parts_recovery": Database["public"]['Enums']["parts_recovery"],"reason_code": Database["public"]['Enums']["refund_reason"],"reason_note": string | null,"refund_account": string | null,"refund_bank": string | null,"refund_holder": string | null,"refund_method": Database["public"]['Enums']["refund_method"],"refund_no": string,"reject_note": string | null,"rejected_at": string | null,"rejected_by": string | null,"requested_at": string,"requested_by": string,"status": Database["public"]['Enums']["refund_status"],"ticket_id": string,"updated_at": string,"void_note": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  Insert: {
                    "amount": number,"approved_at"?: string | null,"approved_by"?: string | null,"cash_receipt_cancel_required"?: boolean,"cash_receipt_canceled_at"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"deduction_amount"?: number,"deduction_note"?: string | null,"evidence"?: NonNullable<Json>,"id"?: string,"material_adjustments"?: NonNullable<Json>,"origin_payment_method": string,"parts_recovery"?: Database["public"]['Enums']["parts_recovery"],"reason_code": Database["public"]['Enums']["refund_reason"],"reason_note"?: string | null,"refund_account"?: string | null,"refund_bank"?: string | null,"refund_holder"?: string | null,"refund_method": Database["public"]['Enums']["refund_method"],"refund_no": string,"reject_note"?: string | null,"rejected_at"?: string | null,"rejected_by"?: string | null,"requested_at"?: string,"requested_by": string,"status"?: Database["public"]['Enums']["refund_status"],"ticket_id": string,"updated_at"?: string,"void_note"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"approved_at"?: string | null,"approved_by"?: string | null,"cash_receipt_cancel_required"?: boolean,"cash_receipt_canceled_at"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"deduction_amount"?: number,"deduction_note"?: string | null,"evidence"?: NonNullable<Json>,"id"?: string,"material_adjustments"?: NonNullable<Json>,"origin_payment_method"?: string,"parts_recovery"?: Database["public"]['Enums']["parts_recovery"],"reason_code"?: Database["public"]['Enums']["refund_reason"],"reason_note"?: string | null,"refund_account"?: string | null,"refund_bank"?: string | null,"refund_holder"?: string | null,"refund_method"?: Database["public"]['Enums']["refund_method"],"refund_no"?: string,"reject_note"?: string | null,"rejected_at"?: string | null,"rejected_by"?: string | null,"requested_at"?: string,"requested_by"?: string,"status"?: Database["public"]['Enums']["refund_status"],"ticket_id"?: string,"updated_at"?: string,"void_note"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_refunds_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_refunds_completed_by_fkey"
      columns: ["completed_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_refunds_rejected_by_fkey"
      columns: ["rejected_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_refunds_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_refunds_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_refunds_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_removed_parts": {
                  Row: {
                    "category_id": string | null,"created_at": string,"created_by": string | null,"description": string,"disposition": string | null,"handled_at": string | null,"handled_by": string | null,"id": string,"inbound_approved_at": string | null,"inbound_approved_by": string | null,"inventory_item_id": string | null,"part_spec_id": string | null,"quantity": number,"return_capacity": string | null,"return_condition": string | null,"return_name": string | null,"return_spec": string | null,"ticket_id": string,"updated_at": string
                  }
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description": string,"disposition"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"inbound_approved_at"?: string | null,"inbound_approved_by"?: string | null,"inventory_item_id"?: string | null,"part_spec_id"?: string | null,"quantity"?: number,"return_capacity"?: string | null,"return_condition"?: string | null,"return_name"?: string | null,"return_spec"?: string | null,"ticket_id": string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"disposition"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"inbound_approved_at"?: string | null,"inbound_approved_by"?: string | null,"inventory_item_id"?: string | null,"part_spec_id"?: string | null,"quantity"?: number,"return_capacity"?: string | null,"return_condition"?: string | null,"return_name"?: string | null,"return_spec"?: string | null,"ticket_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_removed_parts_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "inventory_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_removed_parts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_removed_parts_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_removed_parts_inbound_approved_by_fkey"
      columns: ["inbound_approved_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_removed_parts_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_removed_parts_part_spec_id_fkey"
      columns: ["part_spec_id"]
isOneToOne: false
      referencedRelation: "part_specs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_removed_parts_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_symptoms": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"note": string | null,"symptom_code_id": string | null,"ticket_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"symptom_code_id"?: string | null,"ticket_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"symptom_code_id"?: string | null,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_symptoms_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_symptoms_symptom_code_id_fkey"
      columns: ["symptom_code_id"]
isOneToOne: false
      referencedRelation: "symptom_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_symptoms_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "compatibility_summary": {
                  Row: {
                    "compatibility_id": string | null,"confidence": string | null,"document_count": number | null,"has_override": boolean | null,"inference_count": number | null,"install_conditional": number | null,"install_incompatible": number | null,"install_ok": number | null,"is_candidate": boolean | null,"last_evidence_at": string | null,"limitation_note": string | null,"manufacturer": string | null,"part_name": string | null,"part_spec_id": string | null,"part_type": string | null,"status": string | null,"target_id": string | null,"target_label": string | null,"target_type": string | null
                  }
                  Relationships: [
                    
                  ]
                },"donor_potential_stock": {
                  Row: {
                    "board_number": string | null,"brand": string | null,"candidate_id": string | null,"candidate_status": string | null,"catalog_model_label": string | null,"category_name": string | null,"condition_estimate": string | null,"created_at": string | null,"description": string | null,"device_type": Database["public"]['Enums']["device_type"] | null,"donor_id": string | null,"donor_no": string | null,"model_text": string | null,"note": string | null,"part_name": string | null,"part_spec_id": string | null,"part_type": string | null,"quantity": number | null,"storage_note": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "donor_part_candidates_part_spec_id_fkey"
      columns: ["part_spec_id"]
isOneToOne: false
      referencedRelation: "part_specs"
      referencedColumns: ["id"]
    }
                  ]
                },"repair_parts_used": {
                  Row: {
                    "capacity": string | null,"category_name": string | null,"condition": Database["public"]['Enums']["item_condition"] | null,"is_outsourced": boolean | null,"material_id": string | null,"product_name": string | null,"quantity": number | null,"request_type": string | null,"spec_name": string | null,"ticket_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_materials_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "repair_tickets"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "apply_refund_material_adjustments":
{ Args: { "p_refund_id": string,"p_revert": boolean }; Returns: undefined
                           },
"approve_material_dispatch":
{ Args: { "p_material_id": string,"p_user_id"?: string }; Returns: Json
                           },
"approve_removed_part_inbound":
{ Args: { "p_removed_part_id": string }; Returns: Json
                           },
"approve_return_material":
{ Args: { "p_material_id": string }; Returns: Json
                           },
"catalog_create_model":
{ Args: { "p_brand": string,"p_device_type"?: Database["public"]['Enums']["device_type"],"p_model": string,"p_variant"?: string }; Returns: Json
                           },
"catalog_map_model_string":
{ Args: { "p_alias"?: string,"p_model_id": string,"p_norm": string,"p_variant_id"?: string }; Returns: Json
                           },
"catalog_normalize":
{ Args: { "p": string }; Returns: string
                           },
"catalog_search_boards":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "board_id": string,"board_number": string,"manufacturer": string,"matched": string,"score": number
            }[]
                           },
"catalog_search_models":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "brand_name": string,"matched": string,"model_id": string,"model_name": string,"score": number,"variant_id": string,"variant_name": string
            }[]
                           },
"catalog_unmap_alias":
{ Args: { "p_alias_id": string }; Returns: Json
                           },
"catalog_unmapped_model_strings":
{ Args: { "p_limit"?: number }; Returns: {
              "brands": (string)[],"norm": string,"raw_strings": (string)[],"suggestions": Json,"test_count": number,"ticket_count": number
            }[]
                           },
"confirm_material_return":
{ Args: { "p_material_id": string }; Returns: Json
                           },
"donor_convert_from_ticket":
{ Args: { "p_brand": string,"p_condition_note"?: string,"p_consent": boolean,"p_model_text": string,"p_storage_note"?: string,"p_tag_info"?: string,"p_ticket_id": string }; Returns: Json
                           },
"donor_extract_part":
{ Args: { "p_candidate_id": string,"p_capacity"?: string,"p_category_id"?: string,"p_name"?: string,"p_spec"?: string }; Returns: Json
                           },
"get_device_knowledge":
{ Args: { "p_board_id"?: string,"p_exclude_ticket_id"?: string,"p_model_id"?: string,"p_variant_id"?: string }; Returns: Json
                           },
"get_my_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["employee_role"]
                           },
"label_lookup":
{ Args: { "p_code": string }; Returns: Json
                           },
"part_spec_create":
{ Args: { "p_compat_target"?: string,"p_manufacturer"?: string,"p_name": string,"p_part_type": string }; Returns: Json
                           },
"part_spec_search":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "compat_target": string,"manufacturer": string,"matched": string,"name": string,"part_spec_id": string,"part_type": string,"score": number
            }[]
                           },
"purchase_guard_check":
{ Args: { "p_material_id": string }; Returns: Json
                           },
"recalc_ticket_material_cost":
{ Args: { "p_ticket_id": string }; Returns: number
                           },
"record_compatibility_result":
{ Args: { "p_kind": string,"p_limitation_note"?: string,"p_note"?: string,"p_observed_status": string,"p_part_spec_id": string,"p_reference"?: string,"p_target_id": string,"p_target_type": string }; Returns: Json
                           },
"record_part_install_result":
{ Args: { "p_answer": string,"p_limitation_note"?: string,"p_material_id": string,"p_part_spec_id": string,"p_target_id"?: string,"p_target_type"?: string }; Returns: Json
                           },
"register_return_material":
{ Args: { "p_capacity"?: string,"p_category_id": string,"p_condition": string,"p_material_id": string,"p_name": string,"p_quantity"?: number,"p_spec": string }; Returns: Json
                           },
"repair_gate_check":
{ Args: { "p_gate": string,"p_ticket_id": string }; Returns: Json
                           },
"repair_gate_override":
{ Args: { "p_gate": string,"p_reason": string,"p_ticket_id": string }; Returns: string
                           },
"repair_record_can_edit":
{ Args: { "p_ticket_id": string }; Returns: boolean
                           },
"repair_set_cancel_result":
{ Args: { "p_result": string,"p_ticket_id": string }; Returns: undefined
                           },
"request_purchase_material":
{ Args: { "p_material_id": string,"p_reason_code"?: string,"p_reason_note"?: string }; Returns: Json
                           },
"request_refund":
{ Args: { "p_amount": number,"p_material_adjustments"?: Json,"p_reason_code": Database["public"]['Enums']["refund_reason"],"p_reason_note"?: string,"p_refund_account"?: string,"p_refund_bank"?: string,"p_refund_holder"?: string,"p_refund_method": Database["public"]['Enums']["refund_method"],"p_ticket_id": string }; Returns: {
              "amount": number,
"approved_at": string | null,
"approved_by": string | null,
"cash_receipt_cancel_required": boolean,
"cash_receipt_canceled_at": string | null,
"completed_at": string | null,
"completed_by": string | null,
"created_at": string,
"deduction_amount": number,
"deduction_note": string | null,
"evidence": NonNullable<Json>,
"id": string,
"material_adjustments": NonNullable<Json>,
"origin_payment_method": string,
"parts_recovery": Database["public"]['Enums']["parts_recovery"],
"reason_code": Database["public"]['Enums']["refund_reason"],
"reason_note": string | null,
"refund_account": string | null,
"refund_bank": string | null,
"refund_holder": string | null,
"refund_method": Database["public"]['Enums']["refund_method"],
"refund_no": string,
"reject_note": string | null,
"rejected_at": string | null,
"rejected_by": string | null,
"requested_at": string,
"requested_by": string,
"status": Database["public"]['Enums']["refund_status"],
"ticket_id": string,
"updated_at": string,
"void_note": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "ticket_refunds"
        isOneToOne: true
        isSetofReturn: false
      } },
"retract_compatibility_evidence":
{ Args: { "p_evidence_id": string,"p_reason": string }; Returns: Json
                           },
"ri_compatibility_row":
{ Args: { "p_part_spec_id": string,"p_target_id": string,"p_target_type": string }; Returns: string
                           },
"ri_inbound_extracted_part":
{ Args: { "p_capacity": string,"p_category_id": string,"p_name": string,"p_quantity": number,"p_spec": string,"p_ticket_id": string,"p_tx_user_id": string }; Returns: string
                           },
"ri_next_item_label":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"ri_purchase_material_info":
{ Args: { "p_lock"?: boolean,"p_material_id": string }; Returns: {
              "item_label": string,"material_id": string,"outsourced": boolean,"quantity": number,"request_status": string,"request_type": string,"ticket_id": string
            }[]
                           },
"ri_purchase_resources":
{ Args: { "p_material_id": string }; Returns: Json
                           },
"ri_recompute_compatibility":
{ Args: { "p_compatibility_id": string }; Returns: undefined
                           },
"search_devices_for_part":
{ Args: { "p_part_spec_id": string }; Returns: {
              "confidence": string,"document_count": number,"install_conditional": number,"install_incompatible": number,"install_ok": number,"is_candidate": boolean,"limitation_note": string,"linked_models": string,"rank": number,"status": string,"target_id": string,"target_label": string,"target_type": string
            }[]
                           },
"search_parts_for_device":
{ Args: { "p_board_id"?: string,"p_model_id"?: string,"p_variant_id"?: string }; Returns: {
              "confidence": string,"document_count": number,"donor_qty": number,"install_conditional": number,"install_incompatible": number,"install_ok": number,"is_candidate": boolean,"limitation_note": string,"manufacturer": string,"part_name": string,"part_spec_id": string,"part_type": string,"rank": number,"status": string,"stock_qty": number,"target_id": string,"target_label": string,"target_type": string
            }[]
                           },
"set_storage_location":
{ Args: { "p_id": string,"p_kind": string,"p_location_id": string }; Returns: Json
                           },
"transition_refund":
{ Args: { "p_action": string,"p_cash_receipt_canceled"?: boolean,"p_note"?: string,"p_refund_id": string }; Returns: {
              "amount": number,
"approved_at": string | null,
"approved_by": string | null,
"cash_receipt_cancel_required": boolean,
"cash_receipt_canceled_at": string | null,
"completed_at": string | null,
"completed_by": string | null,
"created_at": string,
"deduction_amount": number,
"deduction_note": string | null,
"evidence": NonNullable<Json>,
"id": string,
"material_adjustments": NonNullable<Json>,
"origin_payment_method": string,
"parts_recovery": Database["public"]['Enums']["parts_recovery"],
"reason_code": Database["public"]['Enums']["refund_reason"],
"reason_note": string | null,
"refund_account": string | null,
"refund_bank": string | null,
"refund_holder": string | null,
"refund_method": Database["public"]['Enums']["refund_method"],
"refund_no": string,
"reject_note": string | null,
"rejected_at": string | null,
"rejected_by": string | null,
"requested_at": string,
"requested_by": string,
"status": Database["public"]['Enums']["refund_status"],
"ticket_id": string,
"updated_at": string,
"void_note": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "ticket_refunds"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "device_type": "노트북"|"데스크탑"|"서버"|"나스"|"기타저장장치"|"태블릿","employee_role": "ADMIN"|"MANAGER"|"RECEPTION"|"TECHNICIAN"|"EXPERT_REPAIR"|"CS","inventory_condition": "NEW"|"GOOD"|"DEFECTIVE"|"SURPLUS","inventory_transaction_type": "INBOUND"|"OUTBOUND"|"ADJUSTMENT","item_condition": "NEW"|"USED","material_request_status": "pending"|"requested"|"approved"|"rejected"|"cancelled"|"cancel_requested","parts_recovery": "RECOVERED"|"NOT_RECOVERED"|"NONE","payment_status": "PENDING"|"PAID"|"PARTIALLY_REFUNDED"|"REFUNDED","receipt_type": "VISIT"|"DELIVERY"|"WALK_IN"|"QUICK"|"PARCEL"|"미정","refund_method": "CARD_CANCEL"|"CARD_PARTIAL_CANCEL"|"BANK_REFUND"|"CASH","refund_reason": "QUALITY"|"REPAIR_FAILED"|"OVERCHARGE"|"DUPLICATE"|"COMPLAINT"|"CHANGE_MIND"|"OTHER","refund_status": "REQUESTED"|"APPROVED"|"COMPLETED"|"REJECTED"|"VOID","ticket_status": "NEW"|"ASSIGNED"|"RECEIVED"|"IN_PROGRESS"|"WAITING_APPROVAL"|"COMPLETED"|"CANCELED"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "device_type": ["노트북", "데스크탑", "서버", "나스", "기타저장장치", "태블릿"],"employee_role": ["ADMIN", "MANAGER", "RECEPTION", "TECHNICIAN", "EXPERT_REPAIR", "CS"],"inventory_condition": ["NEW", "GOOD", "DEFECTIVE", "SURPLUS"],"inventory_transaction_type": ["INBOUND", "OUTBOUND", "ADJUSTMENT"],"item_condition": ["NEW", "USED"],"material_request_status": ["pending", "requested", "approved", "rejected", "cancelled", "cancel_requested"],"parts_recovery": ["RECOVERED", "NOT_RECOVERED", "NONE"],"payment_status": ["PENDING", "PAID", "PARTIALLY_REFUNDED", "REFUNDED"],"receipt_type": ["VISIT", "DELIVERY", "WALK_IN", "QUICK", "PARCEL", "미정"],"refund_method": ["CARD_CANCEL", "CARD_PARTIAL_CANCEL", "BANK_REFUND", "CASH"],"refund_reason": ["QUALITY", "REPAIR_FAILED", "OVERCHARGE", "DUPLICATE", "COMPLAINT", "CHANGE_MIND", "OTHER"],"refund_status": ["REQUESTED", "APPROVED", "COMPLETED", "REJECTED", "VOID"],"ticket_status": ["NEW", "ASSIGNED", "RECEIVED", "IN_PROGRESS", "WAITING_APPROVAL", "COMPLETED", "CANCELED"]
          }
        }
} as const

